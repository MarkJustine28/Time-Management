const mysql = require('mysql2/promise');
require('dotenv').config();

const dbHost = process.env.DB_HOST || process.env.MYSQLHOST || 'localhost';
const dbPort = Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306);
const dbUser = process.env.DB_USER || process.env.MYSQLUSER || 'root';
const dbPassword = process.env.DB_PASS || process.env.MYSQLPASSWORD || '';
const dbName = process.env.DB_NAME || process.env.MYSQL_DATABASE || 'timemanagement';

const pool = mysql.createPool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelayMs: 30000,
  connectionTimeoutMillis: 10000,
  acquireTimeoutMillis: 10000
});

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  return rows[0].count > 0;
}

async function getForeignKeyName(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT CONSTRAINT_NAME AS fkName
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL
     LIMIT 1`,
    [tableName, columnName]
  );

  return rows[0]?.fkName || null;
}

async function init() {
  // Create tables if they don't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      archived_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT DEFAULT NULL,
      employee_name VARCHAR(255) NOT NULL,
      time_in DATETIME NOT NULL,
      time_out DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;
  `);

  if (!(await columnExists('employees', 'archived_at'))) {
    await pool.query('ALTER TABLE employees ADD COLUMN archived_at DATETIME DEFAULT NULL AFTER name');
  }

  if (!(await columnExists('sessions', 'employee_name'))) {
    await pool.query('ALTER TABLE sessions ADD COLUMN employee_name VARCHAR(255) NULL AFTER employee_id');
  }

  await pool.query(`
    UPDATE sessions s
    LEFT JOIN employees e ON e.id = s.employee_id
    SET s.employee_name = COALESCE(s.employee_name, e.name)
  `);

  await pool.query('ALTER TABLE sessions MODIFY employee_id INT DEFAULT NULL');
  await pool.query('ALTER TABLE sessions MODIFY employee_name VARCHAR(255) NOT NULL');

  const fkName = await getForeignKeyName('sessions', 'employee_id');
  if (fkName) {
    await pool.query(`ALTER TABLE sessions DROP FOREIGN KEY \`${fkName}\``);
  }

  await pool.query(`
    ALTER TABLE sessions
    ADD CONSTRAINT fk_sessions_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
  `).catch((error) => {
    if (error?.code !== 'ER_CANT_CREATE_TABLE' && error?.code !== 'ER_DUP_KEYNAME') {
      throw error;
    }
  });
}

async function getConnection() {
  return pool;
}

module.exports = { init, getConnection };
