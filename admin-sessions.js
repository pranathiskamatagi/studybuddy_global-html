document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const listEl = document.getElementById('session-list');

  function buildRow(s) {
    const row = document.createElement('a');
    row.className = 'session-row';
    row.href = `admin-chat-view.html?sessionId=${s.id}&mode=${s.mode}`;

    const top = document.createElement('div');
    top.className = 'session-top';

    const names = document.createElement('p');
    names.className = 'session-names';
    names.textContent = s.participantNames.join(' & ') || 'Unknown';

    const tag = document.createElement('span');
    tag.className = 'session-mode-tag';
    tag.textContent = s.mode;

    top.append(names, tag);

    const topic = document.createElement('p');
    topic.className = 'session-topic';
    topic.textContent = [s.subject, s.topic].filter(Boolean).join(' · ') || 'No topic';

    const time = document.createElement('p');
    time.className = 'session-time';
    time.textContent = timeAgo(s.startedAt) + (s.endedAt ? ' · ended' : ' · ongoing');

    row.append(top, topic, time);
    return row;
  }

  apiFetch('/admin/sessions')
    .then((data) => {
      listEl.innerHTML = '';
      data.sessions.forEach((s) => listEl.appendChild(buildRow(s)));
    })
    .catch((error) => {
      if (handleAuthError(error)) return;
      listEl.textContent = "Couldn't load conversations: " + error.message;
    });

});
