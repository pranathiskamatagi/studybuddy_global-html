document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const user = getStoredUser();
  if (!user?.isAdmin) {
    window.location.href = 'home.html';
    return;
  }

  const dayListEl = document.getElementById('day-list');
  const peopleListEl = document.getElementById('people-list');

  // Backend timestamps are UTC without a timezone marker - same handling
  // as timeAgo() in api.js.
  function parseStart(iso) {
    return new Date(/[Z+-]\d\d:?\d\d$|Z$/.test(iso) ? iso : iso + 'Z');
  }

  function dayLabel(date) {
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fullTime(date) {
    return date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  function buildRow(label, count, extraClass) {
    const row = document.createElement('div');
    row.className = 'conv-row ' + (extraClass || '');
    const top = document.createElement('div');
    top.className = 'conv-row-top';
    const labelEl = document.createElement('span');
    labelEl.className = 'conv-label';
    labelEl.textContent = label;
    const countEl = document.createElement('span');
    countEl.className = 'conv-count';
    countEl.textContent = `${count} conversation${count === 1 ? '' : 's'}`;
    top.append(labelEl, countEl);
    row.appendChild(top);
    return { row, top };
  }

  apiFetch('/admin/conversation-summary')
    .then((data) => {
      document.getElementById('conv-total').textContent =
        `${data.total} conversation${data.total === 1 ? '' : 's'} in total. Who talked with whom, and when - messages are never shown here.`;

      if (data.total === 0) {
        document.getElementById('empty-note').hidden = false;
        return;
      }

      // By day: every conversation from every pair, grouped by local day.
      const perDay = new Map();
      data.people.forEach((p) => p.conversations.forEach((c) => {
        const start = parseStart(c.startedAt);
        const key = dayLabel(start);
        const existing = perDay.get(key) || { count: 0, time: start.getTime() };
        existing.count += 1;
        existing.time = Math.max(existing.time, start.getTime());
        perDay.set(key, existing);
      }));
      Array.from(perDay.entries())
        .sort((a, b) => b[1].time - a[1].time)
        .forEach(([label, info]) => dayListEl.appendChild(buildRow(label, info.count, 'conv-day').row));

      // Who talked with whom - tap a row for the individual times.
      data.people.forEach((p) => {
        const { row, top } = buildRow(p.label, p.count);
        const details = document.createElement('div');
        details.className = 'conv-details';
        details.hidden = true;
        p.conversations.forEach((c) => {
          const line = document.createElement('p');
          line.className = 'conv-detail';
          const topic = [c.subject, c.topic].filter(Boolean).join(' · ');
          line.textContent = fullTime(parseStart(c.startedAt)) + (topic ? ' - ' + topic : '');
          details.appendChild(line);
        });
        row.appendChild(details);
        top.addEventListener('click', () => { details.hidden = !details.hidden; });
        peopleListEl.appendChild(row);
      });
    })
    .catch((error) => {
      if (handleAuthError(error)) return;
      peopleListEl.textContent = "Couldn't load the summary: " + error.message;
    });

});
