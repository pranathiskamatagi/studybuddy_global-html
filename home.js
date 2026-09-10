document.addEventListener('DOMContentLoaded', () => {

  // Home requires being logged in - requireLogin() (from api.js) bounces
  // straight to login.html if there's no saved token, before wasting any
  // time trying to show a page that has no real data to show.
  if (!requireLogin()) return;

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

  // Builds one real request row using safe DOM methods (createElement +
  // textContent), NOT innerHTML - these values (name, topic...) come from
  // real user input elsewhere in the app, so inserting them as raw HTML
  // would be an XSS risk if someone typed something malicious as their
  // name or topic.
  function buildRequestRow(r) {
    const row = document.createElement('div');
    row.className = 'request-row';
    // "Helping" a learn-request means YOU teach; helping a teach-request
    // means YOU learn - always the opposite of their own mode.
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
      showConfirmModal('Log out of StudyBuddy Global?', () => {
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
    { text: 'Education is the most powerful weapon which you can use to change the world.', author: '— Nelson Mandela' },
    { text: 'The beautiful thing about learning is that no one can take it away from you.', author: '— B.B. King' },
    { text: 'Tell me and I forget, teach me and I may remember, involve me and I learn.', author: '— Benjamin Franklin' },
    { text: 'The expert in anything was once a beginner.', author: '— Helen Hayes' },
    { text: 'Each one, teach one.', author: '— African-American Proverb' },
  ];

  const quoteContent = document.getElementById('quote-content');
  const quoteTextEl = document.getElementById('quote-text');
  const quoteAuthorEl = document.getElementById('quote-author');
  const quoteDots = document.getElementById('quote-dots');

  let currentQuoteIndex = 0;

  // Build one dot button per quote in the array, instead of hand-writing
  // them in the HTML. forEach runs this function once for every item -
  // "index" tells us WHICH quote (0, 1, 2...) each dot represents.
  quotes.forEach((quote, index) => {
    const dot = document.createElement('button'); // creates a brand-new <button> in memory
    dot.type = 'button';
    dot.className = 'quote-dot';
    dot.setAttribute('aria-label', `Show quote ${index + 1}`);
    dot.addEventListener('click', () => showQuote(index));
    quoteDots.appendChild(dot); // actually adds it to the page
  });

  // Updates the visible text/author and which dot looks "active".
  function showQuote(index) {
    currentQuoteIndex = index;
    quoteTextEl.textContent = `“${quotes[index].text}”`;
    quoteAuthorEl.textContent = quotes[index].author;

    // Loop over every dot and toggle "active" only on the matching one.
    quoteDots.querySelectorAll('.quote-dot').forEach((dot, dotIndex) => {
      dot.classList.toggle('active', dotIndex === index);
    });
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
      const nextIndex = (currentQuoteIndex + 1) % quotes.length; // wraps back to 0 after the last quote
      showQuote(nextIndex);
      quoteContent.classList.remove('fade-out');
    }, 300);
  }

  showQuote(0); // show the first quote immediately on page load

  // setInterval runs a function repeatedly, forever, every N milliseconds -
  // this is what makes the quote keep changing on its own every 5 seconds.
  setInterval(nextQuote, 5000);

});
