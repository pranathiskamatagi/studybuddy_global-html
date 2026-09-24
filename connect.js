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

  // Same formatting scheduled-sessions.js uses for a real future date/time.
  function formatWhen(iso) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  // Built with safe DOM methods (createElement + textContent), not
  // innerHTML - these values come from real user input elsewhere in the
  // app, so inserting them as raw HTML would be an XSS risk.
  function buildRequestRow(r) {
    const row = document.createElement('div');
    row.className = 'request-row';
    // A group request has no "opposite role" - everyone joining does
    // the same thing (shows up), so this stays 'group' as-is.
    row.dataset.mode = r.mode === 'group' ? 'group' : (r.mode === 'learn' ? 'teach' : 'learn');
    row.dataset.realUserId = r.userId;
    row.dataset.realRequestId = r.id;
    row.dataset.subject = r.subject || '';
    row.dataset.level = r.level || '';
    row.dataset.country = r.country || '';
    row.dataset.scheduledFor = r.scheduledFor || '';

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
    if (r.mode === 'group') {
      descP.append('Wants a group session for ', strong);
    } else {
      descP.append(r.mode === 'learn' ? 'Needs help with ' : 'Wants to teach ', strong);
    }

    const timeP = document.createElement('p');
    // A scheduled-for-later request is a real future ask, not something
    // that happened X minutes ago - shown with its own distinct styling
    // so it reads as "plan for this" rather than "recent activity".
    if (r.scheduledFor) {
      timeP.className = 'request-time request-time-scheduled';
      timeP.textContent = '📅 Wants this on ' + formatWhen(r.scheduledFor);
    } else {
      timeP.className = 'request-time';
      timeP.textContent = timeAgo(r.createdAt);
    }

    info.append(nameP, descP, timeP);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'request-btn';
    // Same reasoning as home.js's identical row - amInterested is the
    // real, server-remembered "did I already click this," so a reload
    // doesn't make it look like nothing happened the first time.
    if (r.mode === 'group' && r.amInterested) {
      btn.textContent = "You're interested ✓";
      btn.disabled = true;
    } else {
      btn.textContent = r.mode === 'group' ? "I'm interested" : (r.scheduledFor ? 'I can help' : (r.mode === 'learn' ? 'Help' : 'Learn from'));
    }

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

    // A group's scheduled ask - unlike a 1-on-1, multiple people can be
    // interested, so this never closes the request (see requests.py's
    // interested_in_group_request) - it just tells the poster, and stays
    // up for anyone else to see too.
    if (mode === 'group') {
      apiFetch(`/help-requests/${row.dataset.realRequestId}/interested`, { method: 'POST' })
        .then(() => {
          button.textContent = "You're interested ✓";
          button.disabled = true;
        })
        .catch((error) => {
          if (handleAuthError(error)) return;
          alert(error.message);
        });
      return;
    }

    // A scheduled-for-later request - there's nobody to search for RIGHT
    // NOW (see requests.py's fulfill_request, which turns this straight
    // into a real accepted scheduled session instead of a live match).
    if (row.dataset.scheduledFor) {
      if (mode === 'teach') {
        // Still has to prove they actually know the topic first, same as
        // any other "I'll teach this" commitment - quiz.html already
        // knows how to fulfill a request once it's done (see quiz.js),
        // this just tells it not to expect a live partner waiting.
        const params = new URLSearchParams({
          with: personName, topic, subject, level, mode,
          fulfillRequestId: row.dataset.realRequestId, scheduled: '1',
        });
        window.location.href = 'quiz.html?' + params.toString();
        return;
      }
      apiFetch(`/help-requests/${row.dataset.realRequestId}/fulfill`, { method: 'POST' })
        .then(() => {
          showInfoModal(`You're set! ${personName} will be notified, and this will show up in your Scheduled sessions.`);
          row.remove();
          if (!requestsList.children.length) requestsSection.hidden = true;
        })
        .catch((error) => {
          if (handleAuthError(error)) return;
          alert("Couldn't take this one: " + error.message);
        });
      return;
    }

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
