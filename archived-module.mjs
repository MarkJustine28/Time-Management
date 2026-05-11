const DEFAULT_API_BASE = typeof window !== 'undefined' && window.API_BASE ? window.API_BASE : 'http://localhost:3000';

export function initArchivedModule({ apiBase = DEFAULT_API_BASE, archivedBodyId = 'archivedBody' } = {}) {
  const archivedBody = document.getElementById(archivedBodyId);
  if (!archivedBody) return;

  const formatDateTime = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const escapeHtml = (str) => String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  async function fetchArchived() {
    const response = await fetch(`${apiBase}/archived`);
    if (!response.ok) throw new Error('request_failed');
    return response.json();
  }

  async function postAction(path, employeeName) {
    const response = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeName }),
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
  }

  function archiveErrorMessage(error) {
    if (error === 'active_session_exists') {
      return 'This employee still has an open session. Time them out before archiving.';
    }

    if (error === 'employee_not_found') {
      return 'That employee could not be found.';
    }

    if (error === 'db_error') {
      return 'The database rejected the archive request.';
    }

    return 'Unable to archive employee.';
  }

  function renderArchived(rows) {
    archivedBody.innerHTML = '';
    if (!rows.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="5" class="muted">No archived employees yet.</td>';
      archivedBody.appendChild(tr);
      return;
    }

    for (const item of rows) {
      const archivedAt = item.archivedAt ? formatDateTime(new Date(item.archivedAt)) : '—';
      const lastSessionAt = item.lastSessionAt ? formatDateTime(new Date(item.lastSessionAt)) : '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(item.employeeName)}</td>
        <td>${archivedAt}</td>
        <td>${item.sessionCount || 0}</td>
        <td>${lastSessionAt}</td>
        <td>
          <div class="table-actions">
            <button type="button" class="primary mini" data-action="restore" data-employee="${escapeHtml(item.employeeName)}">Restore</button>
            <button type="button" class="danger mini" data-action="delete" data-employee="${escapeHtml(item.employeeName)}">Delete Permanently</button>
          </div>
        </td>
      `;
      archivedBody.appendChild(tr);
    }
  }

  async function loadArchived() {
    try {
      const rows = await fetchArchived();
      renderArchived(rows || []);
    } catch {
      archivedBody.innerHTML = '<tr><td colspan="5" class="muted">Unable to load archived employees from the MySQL API.</td></tr>';
    }
  }

  archivedBody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-employee]');
    if (!button || button.disabled) return;

    const employeeName = button.dataset.employee;
    const action = button.dataset.action;

    if (action === 'restore') {
      const confirmed = window.confirm(`Restore ${employeeName} to the active list?`);
      if (!confirmed) return;

      try {
        await postAction('/employee/restore', employeeName);
        loadArchived();
      } catch (error) {
        alert(error.message === 'employee_not_found' ? 'That employee could not be found.' : 'Unable to restore employee.');
      }
    }

    if (action === 'delete') {
      const confirmed = window.confirm(`Delete ${employeeName} permanently? Session history will remain.`);
      if (!confirmed) return;

      try {
        await postAction('/employee/delete-permanently', employeeName);
        loadArchived();
      } catch (error) {
        alert(error.message === 'employee_not_found' ? 'That employee could not be found.' : 'Unable to delete employee permanently.');
      }
    }
  });

  loadArchived();
  setInterval(loadArchived, 30000);
}
