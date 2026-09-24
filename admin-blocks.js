document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const repeatSectionEl = document.getElementById('repeat-offenders-section');
  const repeatListEl = document.getElementById('repeat-list');
  const logListEl = document.getElementById('block-log-list');
  const emptyNoteEl = document.getElementById('empty-note');

  function timeAgoSafe(iso) {
    return typeof timeAgo === 'function' ? timeAgo(iso) : new Date(iso).toLocaleString();
  }

  apiFetch('/admin/blocks')
    .then((data) => {
      if (data.repeatOffenders.length > 0) {
        repeatSectionEl.hidden = false;
        data.repeatOffenders.forEach((r) => {
          const row = document.createElement('div');
          row.className = 'repeat-row';
          const name = document.createElement('p');
          name.className = 'repeat-name';
          name.textContent = r.fullname;
          const count = document.createElement('span');
          count.className = 'repeat-count';
          count.textContent = `Blocked by ${r.blockedByCount} people`;
          row.append(name, count);
          repeatListEl.appendChild(row);
        });
      }

      if (data.blocks.length === 0) {
        logListEl.hidden = true;
        emptyNoteEl.hidden = false;
        return;
      }
      data.blocks.forEach((b) => {
        const row = document.createElement('div');
        row.className = 'block-log-row';
        const text = document.createElement('p');
        text.className = 'block-log-text';
        const blockedNameEl = document.createElement('b');
        blockedNameEl.textContent = b.blockedName;
        text.append(b.blockerName, ' blocked ', blockedNameEl);
        const time = document.createElement('p');
        time.className = 'block-log-time';
        time.textContent = timeAgoSafe(b.createdAt);
        row.append(text, time);
        logListEl.appendChild(row);
      });
    })
    .catch((error) => {
      if (handleAuthError(error)) return;
      logListEl.textContent = "Couldn't load blocks: " + error.message;
    });

});
