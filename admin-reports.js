document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const listEl = document.getElementById('report-list');

  function buildRow(r) {
    const row = document.createElement('div');
    row.className = 'report-row ' + (r.reviewed ? 'resolved' : 'open');

    const top = document.createElement('div');
    top.className = 'report-top';

    const names = document.createElement('p');
    names.className = 'report-names';
    names.textContent = `${r.reporterName} reported ${r.reportedName}`;

    if (!r.reviewed) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'resolve-btn';
      btn.textContent = 'Mark resolved';
      btn.addEventListener('click', () => {
        apiFetch(`/admin/reports/${r.id}/resolve`, { method: 'POST' })
          .then(load)
          .catch((error) => {
            if (handleAuthError(error)) return;
            alert(error.message);
          });
      });
      top.append(names, btn);
    } else {
      top.appendChild(names);
    }

    row.appendChild(top);

    if (r.sessionId) {
      const link = document.createElement('a');
      link.className = 'view-chat-link';
      link.href = `admin-chat-view.html?sessionId=${r.sessionId}`;
      link.textContent = 'View conversation →';
      row.appendChild(link);
    }

    const time = document.createElement('p');
    time.className = 'report-time';
    time.textContent = timeAgo(r.createdAt);
    row.appendChild(time);

    return row;
  }

  function load() {
    apiFetch('/admin/reports')
      .then((data) => {
        listEl.innerHTML = '';
        if (data.reports.length === 0) {
          const note = document.createElement('p');
          note.className = 'empty-note';
          note.textContent = 'No reports yet.';
          listEl.appendChild(note);
          return;
        }
        data.reports.forEach((r) => listEl.appendChild(buildRow(r)));
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        listEl.textContent = "Couldn't load reports: " + error.message;
      });
  }

  load();

});
