document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('sessionId') || '';
  const subject = params.get('subject') || '';
  const topic = params.get('topic') || '';

  // Only reachable right after creating a BRAND NEW empty group (see
  // group-subject.js) - no session id means a stale link, send them back
  // to start a real one instead.
  if (!sessionId) {
    window.location.href = 'group-subject.html';
    return;
  }

  document.getElementById('topic-value').textContent = topic || subject || 'Study group';

  // ---------------------------------------------------------------
  // Animate "..." after the heading - same pattern as connecting.js.
  // ---------------------------------------------------------------
  const dotsEl = document.getElementById('waiting-dots');
  let dotCount = 0;
  setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    dotsEl.textContent = '.'.repeat(dotCount);
  }, 400);

  let pollTimer = null;

  function goToGroupChat() {
    clearTimeout(pollTimer);
    const chatParams = new URLSearchParams({ sessionId, subject, topic });
    window.location.href = 'group-chat.html?' + chatParams.toString();
  }

  // ---------------------------------------------------------------
  // Keeps this person counting as "online" while they wait (same
  // reasoning as connecting.js/match-found.js), and gets told LIVE the
  // moment someone else joins - _notify_group_joined() in sessions.py
  // already sends every existing member a real 'group_joined'
  // notification, which this listens for directly instead of waiting
  // for the next poll tick.
  // ---------------------------------------------------------------
  const presenceSocket = io(SOCKET_BASE, { auth: { token: getToken() } });
  presenceSocket.on('new_notification', (notif) => {
    if (notif.type === 'group_joined' && String(notif.sessionId) === String(sessionId)) {
      goToGroupChat();
    }
  });

  // Polling fallback, in case the live notification is ever missed.
  function checkMembers() {
    apiFetch(`/sessions/${sessionId}/members`)
      .then((data) => {
        if (data.members.length >= 2) {
          goToGroupChat();
        } else {
          pollTimer = setTimeout(checkMembers, 5000);
        }
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        pollTimer = setTimeout(checkMembers, 5000);
      });
  }
  pollTimer = setTimeout(checkMembers, 5000);

  // ---------------------------------------------------------------
  // Leave and cancel - withdraws THIS person's own membership (so the
  // now-empty group stops showing up for anyone else) rather than
  // leaving an abandoned group sitting there with nobody in it forever.
  // ---------------------------------------------------------------
  document.getElementById('cancel-btn').addEventListener('click', () => {
    clearTimeout(pollTimer);
    apiFetch(`/sessions/${sessionId}/leave-group`, {
      method: 'POST',
      body: JSON.stringify({ minutes: 1 }),
    })
      .catch((error) => console.warn('Could not leave the group:', error.message))
      .finally(() => {
        window.location.href = 'home.html';
      });
  });

});
