document.addEventListener('DOMContentLoaded', () => {

  // Home requires being logged in - requireLogin() (from api.js) bounces
  // straight to login.html if there's no saved token, before wasting any
  // time trying to show a page that has no real data to show.
  if (!requireLogin()) return;

  // ---------------------------------------------------------------
  // Real phone notifications - asked about automatically, once, instead
  // of waiting for someone to find the toggle in Settings themselves.
  // A browser will only ever show its OWN real permission prompt from a
  // genuine user action, and only when permission has never been
  // decided either way (Notification.permission === 'default') - there's
  // no way to truly turn this on silently with zero interaction, but
  // this is the closest thing to "on by default": the first real click
  // anywhere on Home (any click at all) triggers the ONE real prompt,
  // then never asks again automatically regardless of what they choose.
  if (typeof isPushSupported === 'function' && isPushSupported()
      && pushPermissionState() === 'default'
      && !localStorage.getItem('studybuddy_push_auto_prompted')) {
    const askOnce = () => {
      document.removeEventListener('click', askOnce);
      localStorage.setItem('studybuddy_push_auto_prompted', '1');
      enablePushNotifications().catch(() => {}); // best-effort - never worth an alert on a page they didn't ask about this on
    };
    document.addEventListener('click', askOnce, { once: true });
  }

  // ---------------------------------------------------------------
  // FEATURE 0: Fill in real points/diamonds/rating from the backend,
  // replacing the hardcoded numbers this page used to show. We show
  // whatever's cached in localStorage from login/signup FIRST (instant,
  // no waiting), then refresh it from the server in case it's changed
  // since (e.g. a session ended in another tab).
  // ---------------------------------------------------------------
  function renderUser(user) {
    document.getElementById('greeting-name').textContent = user.fullname.split(' ')[0];
    document.getElementById('stat-points').textContent = user.points.toLocaleString();
    document.getElementById('stat-diamonds').textContent = user.diamonds.toLocaleString();
    document.getElementById('stat-rating').textContent = (typeof user.rating === 'number') ? user.rating.toFixed(1) : 'New';
    document.getElementById('stat-streak').textContent = user.streak || 0;
    // Only ever true for the one real admin account - see
    // backend/app/admin_helpers.py for how the server enforces this too
    // (this is just what SHOWS the nav item, not what grants access).
    document.getElementById('admin-nav-item').hidden = !user.isAdmin;

    const avatarBtn = document.getElementById('avatar-btn');
    if (user.photo) {
      avatarBtn.innerHTML = '';
      const img = document.createElement('img');
      img.src = user.photo;
      img.alt = '';
      avatarBtn.appendChild(img);
    } else if (!avatarBtn.querySelector('svg')) {
      avatarBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"></path></svg>';
    }
  }

  const cachedUser = getStoredUser();
  if (cachedUser) renderUser(cachedUser);

  apiFetch('/auth/me')
    .then((data) => {
      renderUser(data.user);
      localStorage.setItem('studybuddy_user', JSON.stringify(data.user));
    })
    .catch((error) => {
      // Only a REAL 401 (token actually expired/invalid) means log back
      // in - handleAuthError checks that specifically. A network hiccup
      // or the backend being briefly restarted shouldn't wipe a perfectly
      // valid session just because this one request happened to fail;
      // the cached user from localStorage (already rendered above) stays
      // on screen either way.
      handleAuthError(error);
    });

  // ---------------------------------------------------------------
  // FEATURE 0b: Real community requests + active study sessions. Both
  // lists are always real now - the WHOLE section (heading included)
  // only shows up once there's something real to put in it, rather than
  // ever falling back to a fake person/session or an empty-looking
  // section header.
  // ---------------------------------------------------------------
  const requestsSection = document.getElementById('requests-section');
  const requestsList = document.getElementById('requests-list');
  const sessionsSection = document.getElementById('sessions-section');
  const sessionsRow = document.getElementById('sessions-row');

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

  // Builds one real request row using safe DOM methods (createElement +
  // textContent), NOT innerHTML - these values (name, topic...) come from
  // real user input elsewhere in the app, so inserting them as raw HTML
  // would be an XSS risk if someone typed something malicious as their
  // name or topic.
  function buildRequestRow(r) {
    const row = document.createElement('div');
    row.className = 'request-row';
    // "Helping" a learn-request means YOU teach; helping a teach-request
    // means YOU learn - always the opposite of their own mode. A group
    // request has no "opposite role" - everyone joining does the same
    // thing (shows up), so this stays 'group' as-is.
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
    // A page reload used to always render this fresh, even for someone
    // who'd already clicked it - nothing distinguished "not yet" from
    // "already did" on the row itself, so it looked like clicking never
    // did anything and got clicked again. amInterested is the real,
    // server-remembered answer to "did I already do this."
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

  function buildSessionCard(s) {
    const card = document.createElement('div');
    card.className = 'session-card';
    card.dataset.realSessionId = s.id;

    const stack = document.createElement('div');
    stack.className = 'avatar-stack';
    const countBadge = document.createElement('span');
    countBadge.className = 'avatar-sm avatar-count';
    // No individual member avatars here (active-groups only returns a
    // count) - a plain "N" badge is simpler and still honest, unlike
    // guessing at initials nobody actually has.
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
  // A real 1-on-1 session left without clicking "End session" - see
  // GET /sessions/active-1on1. Passing its real sessionId straight
  // through (not calling POST /sessions again) is what makes this a
  // genuine RESUME - session.js already knows to just reuse an existing
  // session id instead of creating a second one (see its own
  // existingSessionId handling).
  // ---------------------------------------------------------------
  const resumeSessionSection = document.getElementById('resume-session-section');
  const resumeSessionList = document.getElementById('resume-session-list');

  function buildResumeSessionRow(s) {
    const row = document.createElement('div');
    row.className = 'request-row';

    const avatar = document.createElement('span');
    avatar.className = `avatar-sm avatar-${colorFor(s.partnerId)} avatar-lg`;
    avatar.textContent = s.partnerName.charAt(0).toUpperCase();

    const info = document.createElement('div');
    info.className = 'request-info';
    const nameP = document.createElement('p');
    nameP.className = 'request-name';
    nameP.textContent = `${s.subject || s.topic || 'Study session'} with ${s.partnerName}`;
    const descP = document.createElement('p');
    descP.className = 'request-desc';
    descP.textContent = "You left without ending this session - pick up where you left off.";
    info.append(nameP, descP);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'request-btn';
    btn.textContent = 'Rejoin';
    btn.addEventListener('click', () => {
      const avatarColors = ['blue', 'green', 'pink', 'orange'];
      const params = new URLSearchParams({
        partner: s.partnerName,
        color: avatarColors[Number(s.partnerId) % avatarColors.length],
        topic: s.topic || '',
        subject: s.subject || '',
        level: s.level || '',
        country: s.partnerCountry || '',
        flag: '',
        mode: s.mode,
        partnerId: String(s.partnerId),
        sessionId: String(s.id),
      });
      window.location.href = 'session.html?' + params.toString();
    });

    row.append(avatar, info, btn);
    return row;
  }

  apiFetch('/sessions/active-1on1')
    .then((data) => {
      if (!data.activeSessions.length) return;
      data.activeSessions.forEach((s) => resumeSessionList.appendChild(buildResumeSessionRow(s)));
      resumeSessionSection.hidden = false;
    })
    .catch(() => {}); // stays hidden rather than show a broken-looking message

  // ---------------------------------------------------------------
  // A real accepted scheduled session whose time has actually arrived
  // (same 10-minute-early window routes/scheduled.py's own join route
  // allows) - previously the only way to notice this was remembering to
  // check Scheduled Sessions yourself. Click straight into the real chat,
  // same join logic scheduled-sessions.js already uses.
  // ---------------------------------------------------------------
  const readyScheduledSection = document.getElementById('ready-scheduled-section');
  const readyScheduledList = document.getElementById('ready-scheduled-list');
  const JOIN_EARLY_WINDOW_MS = 10 * 60 * 1000;

  function buildReadyScheduledRow(scheduled) {
    const otherId = scheduled.proposerId === myId ? scheduled.inviteeId : scheduled.proposerId;
    const otherName = scheduled.proposerId === myId ? scheduled.inviteeName : scheduled.proposerName;

    const row = document.createElement('div');
    row.className = 'request-row';

    const avatar = document.createElement('span');
    avatar.className = `avatar-sm avatar-${colorFor(otherId)} avatar-lg`;
    avatar.textContent = otherName.charAt(0).toUpperCase();

    const info = document.createElement('div');
    info.className = 'request-info';
    const nameP = document.createElement('p');
    nameP.className = 'request-name';
    nameP.textContent = `${scheduled.subject || scheduled.topic} with ${otherName}`;
    const descP = document.createElement('p');
    descP.className = 'request-desc';
    // Show the actual time it was scheduled for, not just "ready" - and
    // call out when it's already past that time so it's obvious this is
    // now overdue, not just early-window-ready.
    const scheduledTime = formatWhen(scheduled.scheduledFor);
    descP.textContent = Date.now() > new Date(scheduled.scheduledFor).getTime()
      ? `Was scheduled for ${scheduledTime} - join now.`
      : `Scheduled for ${scheduledTime}.`;
    info.append(nameP, descP);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'request-btn';
    btn.textContent = 'Join now';
    btn.addEventListener('click', () => {
      apiFetch(`/scheduled/${scheduled.id}/join`, { method: 'POST' })
        .then((data) => {
          const avatarColors = ['blue', 'green', 'pink', 'orange'];
          const params = new URLSearchParams({
            partner: data.partnerName,
            color: avatarColors[Number(otherId) % avatarColors.length],
            topic: data.topic || '',
            subject: data.subject || '',
            level: '',
            country: data.partnerCountry || '',
            flag: '',
            mode: data.mode,
            partnerId: String(data.partnerId),
            // Tells session.js (and sessions.py's start_session) that the
            // OTHER person needs to click Join THEMSELVES too - no live
            // auto-redirect just because THIS side joined first (see
            // session.js's own scheduled handling for why).
            scheduled: '1',
          });
          window.location.href = 'session.html?' + params.toString();
        })
        .catch((error) => {
          if (handleAuthError(error)) return;
          alert(error.message === 'not_yet' ? "It's not time yet." : error.message);
        });
    });

    row.append(avatar, info, btn);
    return row;
  }

  // Agreed but not time yet - just shows when and with whom, and links to
  // the full Scheduled sessions page (Join appears once it's time).
  function buildUpcomingScheduledRow(scheduled) {
    const otherId = scheduled.proposerId === myId ? scheduled.inviteeId : scheduled.proposerId;
    const otherName = scheduled.proposerId === myId ? scheduled.inviteeName : scheduled.proposerName;

    const row = document.createElement('div');
    row.className = 'request-row';
    const avatar = document.createElement('span');
    avatar.className = `avatar-sm avatar-${colorFor(otherId)} avatar-lg`;
    avatar.textContent = otherName.charAt(0).toUpperCase();
    const info = document.createElement('div');
    info.className = 'request-info';
    const nameP = document.createElement('p');
    nameP.className = 'request-name';
    nameP.textContent = `${scheduled.subject || scheduled.topic} with ${otherName}`;
    const descP = document.createElement('p');
    descP.className = 'request-desc';
    descP.textContent = `Scheduled for ${formatWhen(scheduled.scheduledFor)}.`;
    info.append(nameP, descP);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'request-btn';
    btn.textContent = 'View';
    btn.addEventListener('click', () => { window.location.href = 'scheduled-sessions.html'; });
    row.append(avatar, info, btn);
    return row;
  }

  apiFetch('/scheduled')
    .then((data) => {
      const now = Date.now();
      const ready = data.scheduled.filter((s) =>
        s.status === 'accepted' && new Date(s.scheduledFor).getTime() - JOIN_EARLY_WINDOW_MS <= now
      );
      const upcoming = data.scheduled.filter((s) =>
        s.status === 'accepted' && new Date(s.scheduledFor).getTime() - JOIN_EARLY_WINDOW_MS > now
      );
      const upcomingList = document.getElementById('upcoming-scheduled-list');
      upcoming
        .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor))
        .forEach((s) => upcomingList.appendChild(buildUpcomingScheduledRow(s)));
      if (upcoming.length) document.getElementById('upcoming-scheduled-section').hidden = false;

      if (ready.length === 0) return; // stays hidden - nothing real to show
      ready.forEach((s) => readyScheduledList.appendChild(buildReadyScheduledRow(s)));
      readyScheduledSection.hidden = false;
    })
    .catch(() => {}); // stays hidden rather than show a broken-looking message

  // A group "Schedule for later" request (either one you posted, or one
  // you said "I'm interested" on) whose time has arrived - see
  // GET /help-requests/group-ready. Previously there was no real "it's
  // time" moment for a group at all - just an expectation you'd remember
  // to come back and manually re-enter the same subject/topic yourself.
  function buildGroupReadyRow(r) {
    const row = document.createElement('div');
    row.className = 'request-row';

    const avatar = document.createElement('span');
    avatar.className = 'avatar-sm avatar-pink avatar-lg';
    avatar.textContent = '👥';

    const info = document.createElement('div');
    info.className = 'request-info';
    const nameP = document.createElement('p');
    nameP.className = 'request-name';
    nameP.textContent = `${r.subject || r.topic} group session`;
    const descP = document.createElement('p');
    descP.className = 'request-desc';
    // Same "Scheduled for X" / "Was scheduled for X - join now." pattern
    // as the 1-on-1 ready card - without this it just said "ready" with
    // no real time attached at all, same gap that card had before.
    const scheduledTime = formatWhen(r.scheduledFor);
    descP.textContent = Date.now() > new Date(r.scheduledFor).getTime()
      ? `Was scheduled for ${scheduledTime} - join now.`
      : `Scheduled for ${scheduledTime}.`;
    info.append(nameP, descP);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'request-btn';
    btn.textContent = 'Join now';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      apiFetch('/sessions/join-or-create-group', {
        method: 'POST',
        body: JSON.stringify({ subject: r.subject, topic: r.topic }),
      })
        .then((data) => {
          const params = new URLSearchParams({ sessionId: data.session.id, subject: r.subject, topic: r.topic });
          window.location.href = (data.created ? 'group-waiting.html?' : 'group-chat.html?') + params.toString();
        })
        .catch((error) => {
          if (handleAuthError(error)) return;
          btn.disabled = false;
          alert(error.message);
        });
    });

    row.append(avatar, info, btn);
    return row;
  }

  apiFetch('/help-requests/group-ready')
    .then((data) => {
      if (!data.requests.length) return;
      data.requests.forEach((r) => readyScheduledList.appendChild(buildGroupReadyRow(r)));
      readyScheduledSection.hidden = false;
    })
    .catch(() => {}); // stays hidden rather than show a broken-looking message

  // ---------------------------------------------------------------
  // Your own "Schedule for later" posts that nobody's answered yet - see
  // GET /help-requests/mine. Used to just show a one-time alert() with no
  // way to check on it again afterward.
  // ---------------------------------------------------------------
  const pendingRequestsSection = document.getElementById('pending-requests-section');
  const pendingRequestsList = document.getElementById('pending-requests-list');

  function buildPendingRequestRow(r) {
    const row = document.createElement('div');
    row.className = 'request-row';

    const avatar = document.createElement('span');
    avatar.className = 'avatar-sm avatar-blue avatar-lg';
    avatar.textContent = '⏳';

    const info = document.createElement('div');
    info.className = 'request-info';
    const nameP = document.createElement('p');
    nameP.className = 'request-name';
    nameP.textContent = r.subject || r.topic || 'Study session';
    const descP = document.createElement('p');
    descP.className = 'request-desc';
    // A group request can get real interest from more than one person
    // before anyone actually joins - show that instead of a generic
    // "waiting" that never changes even once someone genuinely has.
    const status = r.mode === 'group' && r.interestedCount > 0
      ? `${r.interestedCount} ${r.interestedCount === 1 ? 'person is' : 'people are'} interested`
      : 'waiting for someone to help';
    descP.textContent = `Scheduled for ${formatWhen(r.scheduledFor)} - ${status}.`;
    info.append(nameP, descP);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'request-btn';
    btn.textContent = 'Cancel';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      apiFetch(`/help-requests/${r.id}/cancel`, { method: 'POST' })
        .then(() => {
          row.remove();
          if (!pendingRequestsList.children.length) pendingRequestsSection.hidden = true;
        })
        .catch((error) => {
          if (handleAuthError(error)) return;
          btn.disabled = false;
          alert(error.message);
        });
    });

    row.append(avatar, info, btn);
    return row;
  }

  apiFetch('/help-requests/mine')
    .then((data) => {
      if (!data.requests.length) return;
      data.requests.forEach((r) => pendingRequestsList.appendChild(buildPendingRequestRow(r)));
      pendingRequestsSection.hidden = false;
    })
    .catch(() => {}); // stays hidden rather than show a broken-looking message

  // ---------------------------------------------------------------
  // Pending quiz challenges - real ones sent TO this person, not yet
  // played. Easy to otherwise never notice (previously only reachable
  // by remembering to open Quiz Challenges from Profile) - shown right
  // on Home, same "hidden until there's something real" pattern as
  // every other section here.
  // ---------------------------------------------------------------
  const challengesSection = document.getElementById('challenges-section');
  const challengesList = document.getElementById('challenges-list');
  const myId = getStoredUser()?.id;

  function buildChallengeRow(c) {
    const row = document.createElement('div');
    row.className = 'request-row';

    const avatar = document.createElement('span');
    avatar.className = `avatar-sm avatar-${colorFor(c.challengerId)} avatar-lg`;
    avatar.textContent = c.challengerName.charAt(0).toUpperCase();

    const info = document.createElement('div');
    info.className = 'request-info';
    const nameP = document.createElement('p');
    nameP.className = 'request-name';
    nameP.textContent = c.challengerName;
    const descP = document.createElement('p');
    descP.className = 'request-desc';
    const strong = document.createElement('strong');
    strong.textContent = c.topic;
    descP.append('Challenged you on ', strong, ` - scored ${c.challengerScore}/${c.totalQuestions}`);
    info.append(nameP, descP);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'request-btn';
    btn.textContent = 'Take quiz';
    btn.addEventListener('click', () => {
      window.location.href = 'challenge-quiz.html?challengeId=' + c.id;
    });

    row.append(avatar, info, btn);
    return row;
  }

  apiFetch('/challenges')
    .then((data) => {
      const pending = data.challenges.filter((c) => c.status === 'pending' && c.challengedId === myId);
      if (pending.length === 0) return; // stays hidden - nothing real to show
      pending.forEach((c) => challengesList.appendChild(buildChallengeRow(c)));
      challengesSection.hidden = false;
    })
    .catch(() => {}); // stays hidden rather than show a broken-looking message

  // ---------------------------------------------------------------
  // FEATURE 1: Sidebar navigation (using EVENT DELEGATION)
  // ---------------------------------------------------------------
  // Instead of adding a click listener to all 13 sidebar buttons one by
  // one, we add ONE listener to their shared parent (#sidebar). Clicks
  // on any child bubble up to the parent, and we check what was
  // actually clicked using event.target.closest('.nav-item').
  // This is called "event delegation" - fewer listeners, same result,
  // and it even works on buttons added to the page later.
  const sidebar = document.getElementById('sidebar');

  sidebar.addEventListener('click', (event) => {
    // .closest() looks at the clicked element AND its ancestors, and
    // returns the first one matching '.nav-item' - useful because the
    // user might click directly on the <svg> icon INSIDE the button,
    // not the button itself.
    const clickedButton = event.target.closest('.nav-item');
    if (!clickedButton) return; // click landed somewhere else in the sidebar, ignore it

    // Remove "active" from whichever button currently has it...
    const currentActive = sidebar.querySelector('.nav-item.active');
    if (currentActive) currentActive.classList.remove('active');

    // ...then add it to the one that was just clicked.
    clickedButton.classList.add('active');

    // Log out needs a confirmation first, so it's handled separately
    // from the rest, which just navigate straight to their screen.
    if (clickedButton.dataset.label === 'Log out') {
      showConfirmModal('Log out of Learnora?', () => {
        clearSession();
        window.location.href = 'index.html';
      }, { confirmText: 'Log out', danger: true });
      return;
    }

    // Every sidebar item now goes somewhere real.
    const sidebarDestinations = {
      'Home': 'home.html',
      'Learn': 'choose-subject.html',
      'Teach': 'teach-subject.html',
      'Connect': 'connect.html',
      'Achievements': 'achievements.html',
      'Leaderboard': 'leaderboard.html',
      'Saved': 'saved.html',
      'Settings': 'settings.html',
      'Safety Center': 'safety-center.html',
      'Help & Support': 'help-support.html',
      'Profile': 'profile.html',
      'Admin': 'admin.html',
    };
    const destination = sidebarDestinations[clickedButton.dataset.label];
    if (destination) {
      window.location.href = destination;
    }
  });

  // ---------------------------------------------------------------
  // FEATURE 1b: Sidebar collapse/expand toggle
  // ---------------------------------------------------------------
  const sidebarToggle = document.getElementById('sidebar-toggle');

  sidebarToggle.addEventListener('click', () => {
    // classList.toggle() adds the class if it's missing, or removes it
    // if it's already there - perfect for an on/off switch like this.
    sidebar.classList.toggle('expanded');
  });

  // ---------------------------------------------------------------
  // FEATURE 2: Notification bell - opens the real Notifications screen,
  // and the red dot reflects REAL unread notifications from the backend.
  // Checked once on load (works even with no live connection), PLUS a
  // live socket connection lights the dot up instantly if a new one
  // arrives while Home is open, without needing a reload.
  // ---------------------------------------------------------------
  const bellBtn = document.getElementById('bell-btn');
  const notifDot = document.getElementById('notif-dot');

  apiFetch('/notifications')
    .then((data) => {
      notifDot.hidden = !data.notifications.some((n) => !n.read);
    })
    .catch(() => {}); // not worth alarming anyone over a dot that just doesn't light up

  const notificationSocket = io(SOCKET_BASE, { auth: { token: getToken() } });
  notificationSocket.on('new_notification', (notif) => {
    notifDot.hidden = false;

    // A rating landing live, right now, is worth celebrating the same
    // way points/diamonds are - see ratings.py, which already writes a
    // "bonus diamond" mention right into the message when it applies.
    if (notif.type === 'rating') {
      showPointsPopup(notif.message, { icon: '⭐' });
    }

    // A bonus from the admin should feel the same way - a real popup
    // right now, plus the coin/diamond numbers up top actually updating
    // instead of only being right again after the next reload.
    if (notif.type === 'bonus') {
      showPointsPopup(notif.message, { icon: '🎁' });
      apiFetch('/auth/me')
        .then((data) => {
          renderUser(data.user);
          localStorage.setItem('studybuddy_user', JSON.stringify(data.user));
        })
        .catch(() => {});
    }
  });

  // The moment someone ELSE starts a real 1-on-1 session with THIS
  // person, drop them straight into the chat instead of leaving them to
  // notice a notification and click it themselves - see sessions.py's
  // 'session_started' emit (only fires once the partner's confirmed
  // online, same rule the search itself uses).
  notificationSocket.on('session_started', goToStartedSession);

  // A community request being cancelled or fulfilled (by anyone,
  // anywhere) should disappear from THIS already-open page immediately -
  // see requests.py's cancel/fulfill routes, which broadcast this the
  // instant it happens, instead of only taking effect on the next reload.
  notificationSocket.on('request_removed', (data) => {
    const row = requestsList.querySelector(`[data-real-request-id="${data.requestId}"]`);
    if (row) {
      row.remove();
      if (!requestsList.children.length) requestsSection.hidden = true;
    }
  });

  bellBtn.addEventListener('click', () => {
    window.location.href = 'notifications.html';
  });

  // ---------------------------------------------------------------
  // FEATURE 2b: Topbar avatar button also opens Profile
  // ---------------------------------------------------------------
  document.querySelector('.avatar-btn').addEventListener('click', () => {
    window.location.href = 'profile.html';
  });

  // ---------------------------------------------------------------
  // FEATURE 3: The WHOLE "I wanna learn" / "I wanna teach" card is clickable
  // ---------------------------------------------------------------
  const ctaRow = document.querySelector('.cta-row');

  function goToCta(card) {
    // dataset.cta reads the data-cta="learn"/"teach"/"group" attribute
    // we set on the card in the HTML, so this ONE function handles all three.
    const type = card.dataset.cta;

    if (type === 'learn') {
      window.location.href = 'choose-subject.html';
    } else if (type === 'teach') {
      window.location.href = 'teach-subject.html';
    } else {
      window.location.href = 'group-subject.html';
    }
  }

  // Mouse/touch: clicking anywhere inside a .cta-card triggers it.
  ctaRow.addEventListener('click', (event) => {
    const card = event.target.closest('.cta-card');
    if (card) goToCta(card);
  });

  // Keyboard: since these cards use role="button" instead of a real
  // <button>, the browser won't fire "click" on Enter/Space for us -
  // we have to listen for those keys ourselves to keep it accessible.
  ctaRow.addEventListener('keydown', (event) => {
    const card = event.target.closest('.cta-card');
    if (!card) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); // stops Space from also scrolling the page
      goToCta(card);
    }
  });

  // ---------------------------------------------------------------
  // FEATURE 4: "Join" buttons on active study sessions
  // ---------------------------------------------------------------
  // These cards each show a STACK of avatars (multiple people) - they're
  // group sessions, not a single study partner. Join now shows the
  // "Connecting you with..." screen first (same as Help her/Learn from),
  // which then drops you into the group chat once it's done.
  sessionsRow.addEventListener('click', (event) => {
    const button = event.target.closest('.join-btn');
    if (!button) return;

    // .closest('.session-card') walks UP from the button to find its
    // parent card, so we can read that card's topic (its <h4>) and
    // the subtitle line underneath it (e.g. "Class 10 · Intermediate").
    const card = button.closest('.session-card');
    const topic = card.querySelector('h4').textContent;
    const subtitle = card.querySelector('.session-sub').textContent;

    if (card.dataset.realSessionId) {
      // A REAL active group - join it directly and go straight into the
      // chat, no need for the "Connecting you..." screen since we
      // already know exactly which group this is.
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
  // FEATURE 5: Community request buttons ("Help her" / "Learn from")
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
      // requires before its own matching screen, just reached from a
      // different starting point. Carrying with/partnerId/country through
      // quiz.html -> teaching-tips.html -> connecting.html means it still
      // ends on the exact-known-partner shortcut (not a generic search).
      // The request is only marked fulfilled once the quiz is actually
      // PASSED (see quiz.js) - marking it here, before the quiz, would
      // silently claim the request even for someone who then fails and
      // gets sent home, leaving the real learner with no teacher at all.
      params.set('fulfillRequestId', row.dataset.realRequestId);
      window.location.href = 'quiz.html?' + params.toString();
      return;
    }

    if (row.dataset.realUserId) {
      // Learning FROM someone's real teach-offer - no quiz needed (you're
      // not the one being vouched for here). Mark their offer fulfilled
      // (best-effort, doesn't block navigating even if this fails).
      apiFetch(`/help-requests/${row.dataset.realRequestId}/fulfill`, { method: 'POST' })
        .catch((error) => console.warn('Could not mark request fulfilled:', error.message));
    }

    window.location.href = 'connecting.html?' + params.toString();
  });

  // ---------------------------------------------------------------
  // FEATURE 6: Rotating quote flashcards (changes every 5 seconds)
  // ---------------------------------------------------------------
  // An ARRAY holds a list of values - here, one object per quote.
  // Each object groups a "text" and an "author" together under one name.
  const quotes = [
    { text: "Education is the most powerful weapon which you can use to change the world.", author: "— Nelson Mandela" },
    { text: "The beautiful thing about learning is that no one can take it away from you.", author: "— B.B. King" },
    { text: "The expert in anything was once a beginner.", author: "— Helen Hayes" },
    { text: "Each one, teach one.", author: "— African-American Proverb" },
    { text: "An investment in knowledge pays the best interest.", author: "— Benjamin Franklin" },
    { text: "The more that you read, the more things you will know. The more that you learn, the more places you'll go.", author: "— Dr. Seuss" },
    { text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "— Mahatma Gandhi" },
    { text: "The mind is not a vessel to be filled, but a fire to be kindled.", author: "— Plutarch" },
    { text: "Anyone who stops learning is old, whether at twenty or eighty.", author: "— Henry Ford" },
    { text: "I have no special talent. I am only passionately curious.", author: "— Albert Einstein" },
    { text: "Learning never exhausts the mind.", author: "— Leonardo da Vinci" },
    { text: "It always seems impossible until it's done.", author: "— Nelson Mandela" },
    { text: "Education is the passport to the future, for tomorrow belongs to those who prepare for it today.", author: "— Malcolm X" },
    { text: "The function of education is to teach one to think intensively and to think critically.", author: "— Martin Luther King Jr." },
    { text: "Education is the key to unlocking the world, a passport to freedom.", author: "— Oprah Winfrey" },
    { text: "The teacher who is indeed wise does not bid you to enter the house of his wisdom, but rather leads you to the threshold of your own mind.", author: "— Kahlil Gibran" },
    { text: "What we learn with pleasure we never forget.", author: "— Alfred Mercier" },
    { text: "Learning is a treasure that will follow its owner everywhere.", author: "— Chinese Proverb" },
    { text: "Give a man a fish and you feed him for a day; teach a man to fish and you feed him for a lifetime.", author: "— Proverb" },
    { text: "Success is no accident. It is hard work, perseverance, learning, studying, sacrifice, and most of all, love of what you are doing.", author: "— Pelé" },
    { text: "Change is the end result of all true learning.", author: "— Leo Buscaglia" },
    { text: "The capacity to learn is a gift; the ability to learn is a skill; the willingness to learn is a choice.", author: "— Brian Herbert" },
    { text: "Learn from yesterday, live for today, hope for tomorrow.", author: "— Albert Einstein" },
    { text: "Develop a passion for learning. If you do, you will never cease to grow.", author: "— Anthony J. D'Angelo" },
    { text: "Teaching is the greatest act of optimism.", author: "— Colleen Wilcox" },
    { text: "Teachers open the door, but you must enter by yourself.", author: "— Chinese Proverb" },
    { text: "He who learns but does not think is lost! He who thinks but does not learn is in great danger.", author: "— Confucius" },
    { text: "By learning you will teach; by teaching you will learn.", author: "— Latin Proverb" },
    { text: "Whoever teaches learns in the act of teaching, and whoever learns teaches in the act of learning.", author: "— Paulo Freire" },
    { text: "The best way to learn is to teach.", author: "— Frank Oppenheimer" },
    { text: "While we teach, we learn.", author: "— Seneca" },
    { text: "Knowing is not enough; we must apply. Willing is not enough; we must do.", author: "— Johann Wolfgang von Goethe" },
    { text: "You don't have to be great to start, but you have to start to be great.", author: "— Zig Ziglar" },
    { text: "Education is what remains after one has forgotten what one has learned in school.", author: "— Albert Einstein" },
    { text: "Study hard what interests you the most in the most undisciplined, irreverent and original manner possible.", author: "— Richard Feynman" },
    { text: "Nothing in life is to be feared, it is only to be understood.", author: "— Marie Curie" },
    { text: "Intellectual growth should commence at birth and cease only at death.", author: "— Albert Einstein" },
    { text: "I am still learning.", author: "— Michelangelo" },
    { text: "Genius is one percent inspiration and ninety-nine percent perspiration.", author: "— Thomas Edison" },
    { text: "The only person who is educated is the one who has learned how to learn and change.", author: "— Carl Rogers" },
    { text: "Curiosity is the wick in the candle of learning.", author: "— William Arthur Ward" },
    { text: "Learning is not attained by chance, it must be sought for with ardor and attended to with diligence.", author: "— Abigail Adams" },
    { text: "A journey of a thousand miles begins with a single step.", author: "— Lao Tzu" },
    { text: "Without continual growth and progress, such words as improvement, achievement, and success have no meaning.", author: "— Benjamin Franklin" },
    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "— Eleanor Roosevelt" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "— Sam Levenson" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "— Confucius" },
    { text: "Success is the sum of small efforts, repeated day in and day out.", author: "— Robert Collier" },
    { text: "There are no shortcuts to any place worth going.", author: "— Beverly Sills" },
    { text: "Discipline is the bridge between goals and accomplishment.", author: "— Jim Rohn" },
    { text: "The difference between ordinary and extraordinary is that little extra.", author: "— Jimmy Johnson" },
    { text: "Believe you can and you're halfway there.", author: "— Theodore Roosevelt" },
    { text: "Failure is simply the opportunity to begin again, this time more intelligently.", author: "— Henry Ford" },
    { text: "Hard work beats talent when talent doesn't work hard.", author: "— Tim Notke" },
    { text: "Our greatest weakness lies in giving up. The most certain way to succeed is always to try just one more time.", author: "— Thomas Edison" },
    { text: "Don't let what you cannot do interfere with what you can do.", author: "— John Wooden" },
    { text: "It's not that I'm so smart, it's just that I stay with problems longer.", author: "— Albert Einstein" },
    { text: "Motivation is what gets you started. Habit is what keeps you going.", author: "— Jim Ryun" },
    { text: "I've failed over and over and over again in my life. And that is why I succeed.", author: "— Michael Jordan" },
  ];

  // Shown in a shuffled order that only repeats once every quote has been
  // seen, starting somewhere different each visit - not the same few, in
  // the same order, every time.
  const quoteOrder = quotes.map((_, i) => i);
  for (let i = quoteOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [quoteOrder[i], quoteOrder[j]] = [quoteOrder[j], quoteOrder[i]];
  }

  const quoteContent = document.getElementById('quote-content');
  const quoteTextEl = document.getElementById('quote-text');
  const quoteAuthorEl = document.getElementById('quote-author');
  const quoteDots = document.getElementById('quote-dots');

  let currentQuoteIndex = 0;

  // Updates the visible text/author and which dot looks "active".
  function showQuote(index) {
    currentQuoteIndex = index;
    const quote = quotes[quoteOrder[index]];
    quoteTextEl.textContent = `“${quote.text}”`;
    quoteAuthorEl.textContent = quote.author;
  }

  // Fades the current quote out, swaps the text while it's invisible,
  // then fades the new one in - this is what makes it feel like a
  // flashcard flipping rather than text just snapping to something new.
  function nextQuote() {
    quoteContent.classList.add('fade-out');

    // setTimeout runs the given function once, after a delay (in ms).
    // 300ms matches the CSS transition duration on .quote-content, so
    // the text swap happens exactly while it's fully faded out.
    setTimeout(() => {
      const nextIndex = (currentQuoteIndex + 1) % quoteOrder.length; // wraps back to 0 after the last quote
      showQuote(nextIndex);
      quoteContent.classList.remove('fade-out');
    }, 300);
  }

  showQuote(0); // show the first quote immediately on page load

  // setInterval runs a function repeatedly, forever, every N milliseconds -
  // this is what makes the quote keep changing on its own every 5 seconds.
  setInterval(nextQuote, 5000);

});
