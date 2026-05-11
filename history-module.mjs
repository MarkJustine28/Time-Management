const DEFAULT_API_BASE = typeof window !== 'undefined' && window.API_BASE ? window.API_BASE : 'http://localhost:3002';

export function initHistoryModule({ apiBase = DEFAULT_API_BASE, historyBodyId = 'historyBody' } = {}) {
  const historyBody = document.getElementById(historyBodyId);
  if (!historyBody) return;

  const formatDateTime = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const formatDuration = (ms) => {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const escapeHtml = (str) => String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '<')
    .replaceAll('>', '>')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  async function fetchHistory() {
    const response = await fetch(`${apiBase}/history`);
    if (!response.ok) throw new Error('request_failed');
    return response.json();
  }

  function renderHistory(history) {
    historyBody.innerHTML = '';
    if (!history.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="5" class="muted">No history yet.</td>';
      historyBody.appendChild(tr);
      return;
    }

    for (const item of history) {
      const timeIn = new Date(item.timeInIso);
      const timeOut = new Date(item.timeOutIso);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(item.employeeName)}</td>
        <td>${item.sessionDate}</td>
        <td>${formatDateTime(timeIn)}</td>
        <td>${formatDateTime(timeOut)}</td>
        <td>${formatDuration((item.durationMinutes || 0) * 60000)}</td>
      `;
      historyBody.appendChild(tr);
    }
  }

  async function loadHistory() {
    try {
      const history = await fetchHistory();
      renderHistory(history || []);
    } catch {
      historyBody.innerHTML = '<tr><td colspan="5" class="muted">Unable to load history from the MySQL API.</td></tr>';
    }
  }

  loadHistory();
  setInterval(loadHistory, 30000);
}
