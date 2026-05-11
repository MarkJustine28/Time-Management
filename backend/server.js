require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const START_PORT = Number(process.env.PORT || process.env.APP_PORT || 3000);

(async () => {
  try {
    await db.init();
    console.log('Database initialized');
  } catch (err) {
    console.error('DB init error', err);
    process.exit(1);
  }

  const pool = await db.getConnection();

  // Helper: convert ISO timestamp (with Z) into MySQL DATETIME 'YYYY-MM-DD HH:MM:SS'
  function toMySqlDatetime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function parseMySqlDatetime(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  async function purgeExpiredArchives() {
    await pool.query(`
      DELETE FROM employees
      WHERE archived_at IS NOT NULL
        AND archived_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);
  }

  await purgeExpiredArchives();

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.get('/roster', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT name FROM employees WHERE archived_at IS NULL ORDER BY name');
      res.json(rows.map(r => r.name));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  app.get('/today', async (req, res) => {
    try {
      const [activeRows] = await pool.query(`
        SELECT s.id, e.name as employeeName, s.time_in as timeInIso
        FROM sessions s
        JOIN employees e ON e.id = s.employee_id
        WHERE s.time_out IS NULL
          AND e.archived_at IS NULL
        ORDER BY s.time_in DESC
      `);

      const [completedRows] = await pool.query(`
        SELECT s.id, COALESCE(e.name, s.employee_name) as employeeName, s.time_in as timeInIso, s.time_out as timeOutIso
        FROM sessions s
        LEFT JOIN employees e ON e.id = s.employee_id
        WHERE DATE(s.time_in) = CURDATE() AND s.time_out IS NOT NULL
        ORDER BY s.time_in ASC
      `);

      const activeByEmployee = {};
      const completedByEmployee = {};
      const sessionsOut = [];

      for (const s of activeRows) {
        activeByEmployee[s.employeeName] = { employeeName: s.employeeName, timeInIso: s.timeInIso };
      }

      for (const s of completedRows) {
        sessionsOut.push({ employeeName: s.employeeName, timeInIso: s.timeInIso, timeOutIso: s.timeOutIso });
        completedByEmployee[s.employeeName] = true;
      }

      res.json({ sessions: sessionsOut, activeByEmployee, completedByEmployee });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  app.get('/history', async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT
          s.id,
          COALESCE(e.name, s.employee_name) as employeeName,
          s.time_in as timeInIso,
          s.time_out as timeOutIso,
          DATE(s.time_in) as sessionDate,
          TIMESTAMPDIFF(MINUTE, s.time_in, s.time_out) as durationMinutes
        FROM sessions s
        LEFT JOIN employees e ON e.id = s.employee_id
        WHERE s.time_out IS NOT NULL
        ORDER BY s.time_in DESC
        LIMIT 50
      `);

      res.json(
        rows.map((row) => ({
          id: row.id,
          employeeName: row.employeeName,
          timeInIso: row.timeInIso,
          timeOutIso: row.timeOutIso,
          sessionDate: row.sessionDate,
          durationMinutes: row.durationMinutes,
        }))
      );
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  app.post('/employee/timein', async (req, res) => {
    const { employeeName, timeInIso } = req.body;
    if (!employeeName || !timeInIso) return res.status(400).json({ error: 'missing_fields' });

    try {
      // Ensure employee exists
      const [existing] = await pool.query('SELECT id, archived_at FROM employees WHERE name = ? LIMIT 1', [employeeName]);
      let employeeId;
      if (existing.length === 0) {
        const [ins] = await pool.query('INSERT INTO employees (name) VALUES (?)', [employeeName]);
        employeeId = ins.insertId;
      } else {
        if (existing[0].archived_at) return res.status(409).json({ error: 'archived_employee' });
        employeeId = existing[0].id;
      }

      // Prevent duplicate active session for the same employee (already time-in without time_out)
      const [activeRows] = await pool.query('SELECT id FROM sessions WHERE employee_id = ? AND time_out IS NULL', [employeeId]);
      if (activeRows.length > 0) return res.status(409).json({ error: 'already_active' });

      const timeIn = toMySqlDatetime(timeInIso) || toMySqlDatetime(new Date().toISOString());
      await pool.query('INSERT INTO sessions (employee_id, employee_name, time_in) VALUES (?, ?, ?)', [employeeId, employeeName, timeIn]);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  app.post('/employee/timeout', async (req, res) => {
    const { employeeName, timeOutIso } = req.body;
    if (!employeeName || !timeOutIso) return res.status(400).json({ error: 'missing_fields' });

    try {
      const [empRows] = await pool.query('SELECT id FROM employees WHERE name = ? LIMIT 1', [employeeName]);
      if (empRows.length === 0) return res.status(404).json({ error: 'employee_not_found' });
      const employeeId = empRows[0].id;

      const [activeRows] = await pool.query('SELECT id FROM sessions WHERE employee_id = ? AND time_out IS NULL ORDER BY time_in DESC LIMIT 1', [employeeId]);
      if (activeRows.length === 0) return res.status(404).json({ error: 'no_active_session' });

      const timeOut = toMySqlDatetime(timeOutIso) || toMySqlDatetime(new Date().toISOString());
      await pool.query('UPDATE sessions SET time_out = ? WHERE id = ?', [timeOut, activeRows[0].id]);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  app.post('/employee/archive', async (req, res) => {
    const { employeeName } = req.body;
    if (!employeeName) return res.status(400).json({ error: 'missing_fields' });

    try {
      const [rows] = await pool.query('SELECT id, archived_at FROM employees WHERE name = ? LIMIT 1', [employeeName]);
      if (rows.length === 0) return res.status(404).json({ error: 'employee_not_found' });
      if (rows[0].archived_at) return res.json({ ok: true });

      const [activeRows] = await pool.query('SELECT id FROM sessions WHERE employee_id = ? AND time_out IS NULL LIMIT 1', [rows[0].id]);
      if (activeRows.length > 0) return res.status(409).json({ error: 'active_session_exists' });

      await pool.query('UPDATE employees SET archived_at = NOW() WHERE id = ?', [rows[0].id]);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  app.post('/employee/restore', async (req, res) => {
    const { employeeName } = req.body;
    if (!employeeName) return res.status(400).json({ error: 'missing_fields' });

    try {
      const [rows] = await pool.query('SELECT id FROM employees WHERE name = ? LIMIT 1', [employeeName]);
      if (rows.length === 0) return res.status(404).json({ error: 'employee_not_found' });

      await pool.query('UPDATE employees SET archived_at = NULL WHERE id = ?', [rows[0].id]);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  app.post('/employee/delete-permanently', async (req, res) => {
    const { employeeName } = req.body;
    if (!employeeName) return res.status(400).json({ error: 'missing_fields' });

    try {
      const [rows] = await pool.query('SELECT id FROM employees WHERE name = ? AND archived_at IS NOT NULL LIMIT 1', [employeeName]);
      if (rows.length === 0) return res.status(404).json({ error: 'employee_not_found' });

      await pool.query('DELETE FROM employees WHERE id = ?', [rows[0].id]);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  app.get('/archived', async (req, res) => {
    try {
      await purgeExpiredArchives();

      const [rows] = await pool.query(`
        SELECT
          e.id,
          e.name as employeeName,
          e.archived_at as archivedAt,
          COUNT(DISTINCT s.id) as sessionCount,
          SUM(CASE WHEN s.time_out IS NULL THEN 1 ELSE 0 END) as activeSessionCount,
          MAX(s.time_in) as lastSessionAt
        FROM employees e
        LEFT JOIN sessions s
          ON s.employee_id = e.id OR s.employee_name = e.name
        WHERE e.archived_at IS NOT NULL
        GROUP BY e.id, e.name, e.archived_at
        ORDER BY e.archived_at DESC, e.name ASC
      `);

      res.json(rows.map((row) => ({
        id: row.id,
        employeeName: row.employeeName,
        archivedAt: row.archivedAt,
        sessionCount: Number(row.sessionCount || 0),
        activeSessionCount: Number(row.activeSessionCount || 0),
        lastSessionAt: row.lastSessionAt,
      })));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  app.post('/reset', async (req, res) => {
    try {
      await pool.query('DELETE FROM sessions WHERE DATE(time_in) = CURDATE()');
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  app.get('/export', async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT COALESCE(e.name, s.employee_name) as employeeName, s.time_in as timeInIso, s.time_out as timeOutIso
        FROM sessions s
        LEFT JOIN employees e ON e.id = s.employee_id
        WHERE DATE(s.time_in) = CURDATE() AND s.time_out IS NOT NULL
        ORDER BY s.time_in ASC
      `);

      const headers = ['Employee', 'Time In', 'Time Out', 'Duration (minutes)'];
      const lines = [headers.join(',')];

      for (const r of rows) {
        const timeIn = parseMySqlDatetime(r.timeInIso);
        const timeOut = parseMySqlDatetime(r.timeOutIso);
        if (!timeIn || !timeOut) continue;
        const durationMinutes = Math.floor((timeOut.getTime() - timeIn.getTime()) / 60000);
        const row = [r.employeeName, timeIn.toISOString(), timeOut.toISOString(), String(durationMinutes)];
        lines.push(row.map(v => `"${v}"`).join(','));
      }

      const csv = lines.join('\n');
      res.setHeader('Content-Disposition', `attachment; filename="employee-timesheets-${new Date().toISOString().slice(0,10)}.csv"`);
      res.setHeader('Content-Type', 'text/csv');
      res.send(csv);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  // Serve frontend static files from the project root (one level above `backend`)
  const STATIC_ROOT = process.env.STATIC_ROOT || path.join(__dirname, '..');
  app.use(express.static(STATIC_ROOT));

  // Optional: ensure root returns index.html
  app.get('/', (req, res) => res.sendFile(path.join(STATIC_ROOT, 'index.html')));

  function listen(port) {
    const server = app.listen(port, () => console.log(`Server listening on ${port}`));

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.warn(`Port ${port} is busy, trying ${port + 1}`);
        server.close(() => listen(port + 1));
        return;
      }

      throw error;
    });
  }

  listen(START_PORT);

})();
