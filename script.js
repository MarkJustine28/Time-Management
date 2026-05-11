const els = {
  employeeName: document.getElementById('employeeName'),
  addEmployeeBtn: document.getElementById('addEmployeeBtn'),
  resetBtn: document.getElementById('resetBtn'),
  exportBtn: document.getElementById('exportBtn'),
  historyBtn: document.getElementById('historyBtn'),
  archivedBtn: document.getElementById('archivedBtn'),
  employeeCount: document.getElementById('employeeCount'),
  activeCount: document.getElementById('activeCount'),
  sessionCount: document.getElementById('sessionCount'),
  totalHours: document.getElementById('totalHours'),
  rosterBody: document.getElementById('rosterBody'),
  sessionsBody: document.getElementById('sessionsBody'),
};

const API_BASE = window.API_BASE || window.location.origin;

function formatDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (!response.ok) {
    let error = 'request_failed';
    try {
      const payload = await response.json();
      error = payload?.error || error;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(error);
  }

  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

function getLastSessionByEmployee(sessions) {
  const lastSessionByEmployee = new Map();
  for (const session of sessions) {
    lastSessionByEmployee.set(session.employeeName, session);
  }
  return lastSessionByEmployee;
}

function calculateTotalMinutes(sessions, activeEntries) {
  let totalMinutes = 0;
  for (const session of sessions) {
    const timeIn = new Date(session.timeInIso).getTime();
    const timeOut = new Date(session.timeOutIso).getTime();
    totalMinutes += Math.floor((timeOut - timeIn) / 60000);
  }

  for (const active of activeEntries) {
    totalMinutes += Math.floor((Date.now() - new Date(active.timeInIso).getTime()) / 60000);
  }

  return totalMinutes;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '<')
    .replaceAll('>', '>')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function fetchState() {
  const [roster, today] = await Promise.all([api('/roster'), api('/today')]);
  return {
    roster,
    sessions: today.sessions || [],
    activeByEmployee: today.activeByEmployee || {},
    completedByEmployee: today.completedByEmployee || {},
  };
}

function renderState(state) {
  const roster = [...state.roster];
  const activeEntries = Object.values(state.activeByEmployee || {});
  const lastSessionByEmployee = getLastSessionByEmployee(state.sessions);

  els.employeeCount.textContent = String(roster.length);
  els.activeCount.textContent = String(activeEntries.length);
  els.sessionCount.textContent = String(state.sessions.length);
  els.totalHours.textContent = formatDuration(calculateTotalMinutes(state.sessions, activeEntries) * 60000);

  els.rosterBody.innerHTML = '';
  if (roster.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="6" class="muted">No employees added yet.</td>';
    els.rosterBody.appendChild(tr);
  } else {
    for (const employeeName of roster) {
      const active = state.activeByEmployee[employeeName] || null;
      const lastSession = lastSessionByEmployee.get(employeeName) || null;
      const completed = Boolean(state.completedByEmployee && state.completedByEmployee[employeeName]);
      const statusText = active ? 'Working' : completed ? 'Completed' : lastSession ? 'Idle' : 'Ready';
      const timeInText = active ? formatDateTime(new Date(active.timeInIso)) : lastSession ? formatDateTime(new Date(lastSession.timeInIso)) : '—';
      const timeOutText = active ? 'In progress' : lastSession ? formatDateTime(new Date(lastSession.timeOutIso)) : '—';
      const durationText = active
        ? formatDuration(Date.now() - new Date(active.timeInIso).getTime())
        : lastSession
          ? formatDuration(new Date(lastSession.timeOutIso).getTime() - new Date(lastSession.timeInIso).getTime())
          : '—';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(employeeName)}</td>
        <td><span class="status-pill ${active ? 'is-active' : 'is-idle'}">${statusText}</span></td>
        <td>${timeInText}</td>
        <td>${timeOutText}</td>
        <td>${durationText}</td>
        <td>
          <div class="table-actions">
            <button type="button" class="primary mini" data-action="time-in" data-employee="${escapeHtml(employeeName)}" ${active || completed ? 'disabled' : ''}>Time In</button>
            <button type="button" class="danger mini" data-action="time-out" data-employee="${escapeHtml(employeeName)}" ${active ? '' : 'disabled'}>Time Out</button>
            <button type="button" class="ghost mini" data-action="archive" data-employee="${escapeHtml(employeeName)}" ${active ? 'disabled' : ''}>Archive</button>
          </div>
        </td>
      `;
      els.rosterBody.appendChild(tr);
    }
  }

  els.sessionsBody.innerHTML = '';
  if (state.sessions.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4" class="muted">No sessions yet.</td>';
    els.sessionsBody.appendChild(tr);
  } else {
    const reversed = [...state.sessions].reverse();
    for (const s of reversed) {
      const timeIn = new Date(s.timeInIso);
      const timeOut = new Date(s.timeOutIso);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(s.employeeName)}</td>
        <td>${formatDateTime(timeIn)}</td>
        <td>${formatDateTime(timeOut)}</td>
        <td>${formatDuration(timeOut.getTime() - timeIn.getTime())}</td>
      `;
      els.sessionsBody.appendChild(tr);
    }
  }
}

function exportToCSV() {
  window.location.href = `${API_BASE}/export`;
}

els.historyBtn?.addEventListener('click', () => {
  window.location.href = 'history.html';
});

els.archivedBtn?.addEventListener('click', () => {
  window.location.href = 'archived.html';
});

els.addEmployeeBtn.addEventListener('click', () => {
  const name = els.employeeName.value.trim();
  if (!name) {
    els.employeeName.focus();
    return;
  }
  api('/employee/timein', {
    method: 'POST',
    body: JSON.stringify({ employeeName: name, timeInIso: new Date().toISOString() }),
  })
    .then(() => {
      els.employeeName.value = '';
      loadAndRender();
    })
    .catch((error) => {
      if (error.message === 'already_active') {
        alert(`${name} is already timed in.`);
        return;
      }
      alert('Unable to time in employee.');
    });
});

els.employeeName.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    els.addEmployeeBtn.click();
  }
});

els.rosterBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-employee]');
  if (!button || button.disabled) return;

  const employeeName = button.dataset.employee;
  const action = button.dataset.action;

  if (action === 'time-in') {
    api('/employee/timein', {
      method: 'POST',
      body: JSON.stringify({ employeeName, timeInIso: new Date().toISOString() }),
    })
      .then(loadAndRender)
      .catch((error) => {
        if (error.message === 'already_active') {
          alert(`${employeeName} is already timed in.`);
          return;
        }
        alert('Unable to time in employee.');
      });
  }

  if (action === 'time-out') {
    api('/employee/timeout', {
      method: 'POST',
      body: JSON.stringify({ employeeName, timeOutIso: new Date().toISOString() }),
    })
      .then(loadAndRender)
      .catch(() => alert('Unable to time out employee.'));
  }

  if (action === 'archive') {
    const confirmed = window.confirm(`Archive ${employeeName}? This moves the employee to the archived list.`);
    if (!confirmed) return;

    api('/employee/archive', {
      method: 'POST',
      body: JSON.stringify({ employeeName }),
    })
      .then(loadAndRender)
      .catch((error) => {
        if (error.message === 'active_session_exists') {
          alert(`${employeeName} still has an active session. Time out first before archiving.`);
          return;
        }
        if (error.message === 'employee_not_found') {
          alert(`${employeeName} could not be found.`);
          return;
        }
        if (error.message === 'db_error') {
          alert('The database rejected the archive request.');
          return;
        }
        alert('Unable to archive employee.');
      });
  }
});

els.exportBtn.addEventListener('click', () => {
  exportToCSV();
});

els.resetBtn.addEventListener('click', () => {
  api('/reset', { method: 'POST' })
    .then(loadAndRender)
    .catch(() => alert('Unable to reset today.'));
});

async function loadAndRender() {
  try {
    const state = await fetchState();
    renderState(state);
  } catch {
    els.rosterBody.innerHTML = '<tr><td colspan="6" class="muted">Unable to load data from the MySQL API. Check that the backend is running.</td></tr>';
    els.sessionsBody.innerHTML = '<tr><td colspan="4" class="muted">Unable to load data from the MySQL API.</td></tr>';
  }
}

setInterval(() => {
  loadAndRender();
}, 1000);

loadAndRender();
