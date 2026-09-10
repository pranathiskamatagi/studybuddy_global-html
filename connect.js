document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const requestsSection = document.getElementById('requests-section');
  const requestsList = document.getElementById('requests-list');
  const sessionsSection = document.getElementById('sessions-section');
  const sessionsRow = document.getElementById('sessions-row');

  // ---------------------------------------------------------------
  // Real community requests + active study sessions - both lists are
  // always real. The whole section (heading included) only shows up
  // once there's something real to put in it. Same pattern as home.js.
  // ---------------------------------------------------------------
  const avatarColors = ['blue', 'green', 'pink', 'orange'];
  function colorFor(id) {
    return avatarColors[id % avatarColors.length];
  }

  // Built with safe DOM methods (createElement + textContent), not
  // innerHTML - these values come from real user input elsewhere in the
  // app, so inserting them as raw HTML would be an XSS risk.
  function buildRequestRow(r) {
    const row = document.createElement('div');
    row.className = 'request-row';
    row.dataset.mode = r.mode === 'learn' ? 'teach' : 'learn';
    row.dataset.realUserId = r.userId;
    row.dataset.realRequestId = r.id;
    row.dataset.subject = r.subject || '';
    row.dataset.level = r.level || '';
    row.dataset.country = r.country || '';

    const avatar = document.createElement('span');
    avatar.className = `avatar-sm avatar-${colorFor(r.userId)} avatar-lg`;
    avatar.textContent = r.fullname.charAt(0).toUpperCase();
    if (r.online) {
      const dot = document.createElement('span');
      dot.className = 'presence-dot';
      avatar.appendChild(dot);
    }

    const info = document.createElement('div');
    info.className = 'request-info';

    const nameP = document.createElement('p');
    nameP.className = 'request-name';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'request-name-text';
    nameSpan.textContent = r.fullname;
    const countrySpan = document.createElement('span');
    countrySpan.className = 'request-country';
    countrySpan.textContent = r.country || '';
    nameP.append(nameSpan, ' ', countrySpan);

    const descP = document.createElement('p');
    descP.className = 'request-desc';
    const strong = document.createElement('strong');
    strong.textContent = r.topic || r.subject || 'something';
    descP.append(r.mode === 'learn' ? 'Needs help with ' : 'Wants to teach ', strong);

    const timeP = document.createElement('p');
    timeP.className = 'request-time';
    timeP.textContent = timeAgo(r.createdAt);

    info.append(nameP, descP, timeP);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'request-btn';
    btn.textContent = r.mode === 'learn' ? 'Help' : 'Learn from';

    row.append(avatar, info, btn);
    return row;
  }

  apiFetch('/help-requests')
    .then((data) => {
      if (data.requests.length === 0) return; // stays hidden - nothing real to show
      data.requests.forEach((r) => requestsList.appendChild(buildRequestRow(r)));
      requestsSection.hidden = false;
    })
    .catch(() => {}); // stays hidden rather than show a broken-looking message

  // A community request being cancelled or fulfilled (by anyone,
  // anywhere) should disappear from THIS already-open page immediately -
  // see requests.py's cancel/fulfill routes, which broadcast this the
  // instant it happens. Also picks up 'session_started' so someone
  // sitting on Connect gets dropped straight into a chat someone else
  // just started with them, same as home.js.
  const liveSocket = io(SOCKET_BASE, { auth: { token: getToken() } });
  liveSocket.on('request_removed', (data) => {
    const row = requestsList.querySelector(`[data-real-request-id="${data.requestId}"]`);
    if (row) {
      row.remove();
      if (!requestsList.children.length) requestsSection.hidden = true;
    }
  });
  liveSocket.on('session_started', goToStartedSession);

  function buildSessionCard(s) {
    const card = document.createElement('div');
    card.className = 'session-card';
    card.dataset.realSessionId = s.id;

    const stack = document.createElement('div');
    stack.className = 'avatar-stack';
    const countBadge = document.createElement('span');
    countBadge.className = 'avatar-sm avatar-count';
    countBadge.textContent = `${s.memberCount} 👥`;
    stack.appendChild(countBadge);

    const info = document.createElement('div');
    info.className = 'session-info';

    const h4 = document.createElement('h4');
    h4.textContent = s.topic || s.subject || 'Study Group';

    const sub = document.createElement('p');
    sub.className = 'session-sub';
    sub.textContent = [s.subject, s.level].filter(Boolean).join(' · ');

    info.append(h4, sub);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'join-btn';
    btn.textContent = 'Join';

    card.append(stack, info, btn);
    return card;
  }

  apiFetch('/sessions/active-groups')
    .then((data) => {
      if (data.activeGroups.length === 0) return; // stays hidden - nothing real to show
      data.activeGroups.forEach((s) => sessionsRow.appendChild(buildSessionCard(s)));
      sessionsSection.hidden = false;
    })
    .catch(() => {}); // stays hidden rather than show a broken-looking message

  // ---------------------------------------------------------------
  // Same pattern as home.js's FEATURE 4 - these cards show multiple
  // avatars (group sessions), so Join shows the "Connecting you
  // with..." screen first, then drops into the group chat (or, for a
  // REAL active group, joins and goes straight into the chat).
  // ---------------------------------------------------------------
  sessionsRow.addEventListener('click', (event) => {
    const button = event.target.closest('.join-btn');
    if (!button) return;

    const card = button.closest('.session-card');
    const topic = card.querySelector('h4').textContent;
    const subtitle = card.querySelector('.session-sub').textContent;

    if (card.dataset.realSessionId) {
      const sessionId = card.dataset.realSessionId;
      apiFetch(`/sessions/${sessionId}/join`, { method: 'POST' })
        .then(() => {
          const params = new URLSearchParams({ sessionId, topic, subtitle });
          window.location.href = 'group-chat.html?' + params.toString();
        })
        .catch((error) => {
          if (handleAuthError(error)) return;
          alert("Couldn't join that group: " + error.message);
        });
      return;
    }

    const params = new URLSearchParams({ with: topic, type: 'group', subtitle });
    window.location.href = 'connecting.html?' + params.toString();
  });

  // ---------------------------------------------------------------
  // Same pattern as home.js's FEATURE 5 for "Help her" / "Learn from".
  // ---------------------------------------------------------------
  requestsList.addEventListener('click', (event) => {
    const button = event.target.closest('.request-btn');
    if (!button) return;

    const row = button.closest('.request-row');
    const personName = row.querySelector('.request-name-text').textContent;
    // The <strong> inside e.g. "Needs help with <strong>Calculus</strong>" -
    // this is a REAL topic, unlike the person's name, so connecting.html's
    // "Topic" box can show something that's actually a topic.
    const topic = row.querySelector('.request-desc strong').textContent;
    // data-subject/data-level on the row give connecting.html the same
    // "Subject · Level" line the choose-subject.html flow shows.
    const subject = row.dataset.subject || '';
    const level = row.dataset.level || '';
    // "Help her/him" means YOU teach them; "Learn from" means you learn.
    const mode = row.dataset.mode || 'learn';

    const params = new URLSearchParams({ with: personName, topic, subject, level, mode });

    if (row.dataset.realUserId) {
      params.set('partnerId', row.dataset.realUserId);
      params.set('country', row.dataset.country || '');
    }

    if (mode === 'teach' && row.dataset.realUserId) {
      // Volunteering to TEACH someone via a real community request - same
      // "prove you actually know this" quiz gate teach-subject.js already
      // requires before its own matching screen (see home.js for the full
      // reasoning - this is the same fix, duplicated here since Connect
      // has its own copy of this button).
      params.set('fulfillRequestId', row.dataset.realRequestId);
      window.location.href = 'quiz.html?' + params.toString();
      return;
    }

    if (row.dataset.realUserId) {
      apiFetch(`/help-requests/${row.dataset.realRequestId}/fulfill`, { method: 'POST' })
        .catch((error) => console.warn('Could not mark request fulfilled:', error.message));
    }

    window.location.href = 'connecting.html?' + params.toString();
  });

});
