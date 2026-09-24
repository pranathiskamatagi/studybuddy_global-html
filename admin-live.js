document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const sessionListEl = document.getElementById('live-session-list');
  const sessionsEmptyEl = document.getElementById('sessions-empty-note');
  const searchingListEl = document.getElementById('searching-list');
  const searchingEmptyEl = document.getElementById('searching-empty-note');

  function buildSessionRow(s) {
    const row = document.createElement('a');
    row.className = 'live-session-row';
    row.href = `admin-chat-view.html?sessionId=${s.id}&mode=${s.mode}`;

    const top = document.createElement('div');
    top.className = 'live-session-top';
    const names = document.createElement('p');
    names.className = 'live-session-names';
    names.textContent = s.participantNames.join(' & ') || 'Unknown';
    const tag = document.createElement('span');
    tag.className = 'live-session-tag';
    tag.textContent = s.mode;
    top.append(names, tag);

    const topic = document.createElement('p');
    topic.className = 'live-session-topic';
    topic.textContent = [s.subject, s.topic].filter(Boolean).join(' · ') || 'No topic';

    const time = document.createElement('p');
    time.className = 'live-session-time';
    time.textContent = 'Started ' + timeAgo(s.startedAt);

    row.append(top, topic, time);
    return row;
  }

  function buildSearchingRow(person) {
    const row = document.createElement('div');
    row.className = 'searching-row';

    const name = document.createElement('p');
    name.className = 'searching-name';
    name.textContent = person.fullname;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'searching-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      showConfirmModal(`Cancel ${person.fullname}'s search? They'll be told an admin cancelled it.`, () => {
        apiFetch(`/admin/searching/${person.userId}/cancel`, { method: 'POST' })
          .then(() => row.remove())
          .catch((error) => alert(error.message));
      }, { confirmText: 'Cancel', danger: true });
    });

    row.append(name, cancelBtn);
    return row;
  }

  apiFetch('/admin/live')
    .then((data) => {
      if (data.ongoingSessions.length === 0) {
        sessionsEmptyEl.hidden = false;
      } else {
        data.ongoingSessions.forEach((s) => sessionListEl.appendChild(buildSessionRow(s)));
      }

      if (data.searching.length === 0) {
        searchingEmptyEl.hidden = false;
      } else {
        data.searching.forEach((p) => searchingListEl.appendChild(buildSearchingRow(p)));
      }
    })
    .catch((error) => {
      if (handleAuthError(error)) return;
      sessionListEl.textContent = "Couldn't load: " + error.message;
    });

});
