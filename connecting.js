document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // Read what to display from the URL's query string.
  // ---------------------------------------------------------------
  // Two different pages link here, with different amounts of info:
  //   - choose-subject.html sends all three: ?subject=..&topic=..&level=..
  //   - home.js's Join / Help her buttons send just: ?with=..
  // We check for the full set first, and fall back to the simpler one.
  const params = new URLSearchParams(window.location.search);
  const subject = params.get('subject');
  const topic = params.get('topic');
  const level = params.get('level');
  const withName = params.get('with');
  // Whether this is a "learn" or "teach" session - carried through so
  // session.js knows which point rule to award when it ends. Defaults to
  // 'learn' for any older link that doesn't send one.
  const mode = params.get('mode') || 'learn';
  // Set when Home's "Join" button sends us here for a group session -
  // tells us to head to the group chat afterward instead of Match Found,
  // and to carry the group's subtitle (e.g. "Class 10 · Intermediate").
  const isGroup = params.get('type') === 'group';
  const groupSubtitle = params.get('subtitle') || '';
  // Set when session.js sends us here because a real partner disconnected
  // mid-session - shows a brief explanation before the normal "Finding
  // your match" flow below picks up someone new.
  const leftName = params.get('left');
  const excludeId = params.get('excludeId') || '';
  // Set when a REAL community-request/known person is being connected to
  // (not a fake demo name) - carried straight through to match-found.html
  // so session.js ends up with a real partner for live chat.
  const partnerId = params.get('partnerId') || '';
  const country = params.get('country') || '';
  // The real community request posted back on choose-subject.html/
  // teach-subject.html for THIS search - withdrawn if Cancel is clicked
  // below, so it stops showing on everyone else's Home the moment this
  // person gives up on it.
  const requestId = params.get('requestId') || '';

  // Keeping a socket connection open for as long as this screen is up is
  // what makes THIS person actually count as "online right now" for
  // someone else's search (see app/sockets.py's get_online_user_ids()) -
  // without this, someone mid-search here would look offline to everyone
  // else, which defeats the entire point of the online-only match rule.
  const presenceSocket = io(SOCKET_BASE, { auth: { token: getToken() } });

  // Someone ELSE just started a real session with THIS person - stop
  // searching and drop straight into that chat instead of continuing to
  // poll for a match that's already been made.
  presenceSocket.on('session_started', (data) => {
    clearTimeout(searchTimer);
    clearTimeout(takingAWhileTimer);
    presenceSocket.emit('stop_searching');
    goToStartedSession(data);
  });

  // Someone ELSE's search just found THIS person as a real match - see
  // matching.py's live push. Without this, this side would have to
  // independently rediscover the exact same match on its own next poll,
  // which can never succeed once the OTHER person has already left the
  // search pool by reaching Match Found - this is what makes the match
  // actually mutual instead of a race only one side can win.
  presenceSocket.on('matched_with_you', (data) => {
    goToMatchFound(data.partnerName, data.partnerId, data.partnerCountry, null);
  });

  if (leftName) {
    const leftNoticeEl = document.getElementById('left-notice');
    leftNoticeEl.textContent = `${leftName} left the session - let's find you someone new.`;
    leftNoticeEl.hidden = false;
  }

  // This page should never be opened with NO information at all - that
  // only happens from a stale bookmark/tab or typing the URL directly.
  // Rather than show a broken "Someone new" placeholder, send the
  // person back to pick a subject instead.
  if (!topic && !withName) {
    window.location.href = 'choose-subject.html';
    return;
  }

  const topicValueEl = document.getElementById('topic-value');
  const topicMetaEl = document.getElementById('topic-meta');

  if (topic) {
    topicValueEl.textContent = topic;

    // Build "Subject · Level" out of whichever of the two we actually
    // have - filter(Boolean) drops any missing piece instead of leaving
    // an awkward gap like "Computer Science · " with nothing after it.
    const metaParts = [subject, level].filter(Boolean);
    if (metaParts.length > 0) {
      topicMetaEl.textContent = metaParts.join(' · ');
      topicMetaEl.hidden = false;
    }
  } else {
    topicValueEl.textContent = withName || 'Someone new';
  }

  // ---------------------------------------------------------------
  // Heading text - when we already know exactly WHO (a community
  // request) or WHAT (a group session) we're connecting to, say so
  // instead of the generic "Finding your match" (that phrase only
  // fits the choose-subject.html flow, where it's a real random-ish
  // match by subject/level).
  // ---------------------------------------------------------------
  const reassuranceEl = document.getElementById('connect-reassurance');

  if (withName) {
    document.getElementById('connect-heading-text').textContent = `Connecting you with ${withName}`;

    // The reassurance line's default text (see connecting.html) doesn't
    // fit once we already know exactly who (or which group) we're
    // connecting to.
    reassuranceEl.textContent = isGroup
      ? "Getting your group chat ready - you'll join the other learners already there."
      : 'Setting up your one-on-one session - just a moment.';
  }

  // ---------------------------------------------------------------
  // Animate "..." after the heading, purely for a livelier feel.
  // ---------------------------------------------------------------
  const dotsEl = document.getElementById('connect-dots');
  let dotCount = 0;

  const dotsInterval = setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    dotsEl.textContent = '.'.repeat(dotCount);
  }, 400);

  // ---------------------------------------------------------------
  // Cancel button: go back to whichever page sent us here. Falling
  // back to home.html covers the case where someone opened this page
  // directly, with no previous page in their browser history.
  // ---------------------------------------------------------------
  let searchTimer = null;
  // Lets the reassurance line quietly change tone if a real match just
  // hasn't shown up yet, instead of repeating the same static line
  // forever no matter how long someone's been waiting.
  let takingAWhileTimer = null;
  const TAKING_A_WHILE_MS = 25000;
  // After this long with genuinely nobody real to match with, stop
  // silently polling forever and just say so - honest, same as never
  // showing a fake match in the first place.
  const SEARCH_TIMEOUT_MS = 10 * 60 * 1000;
  let searchStartedAt = null;

  const cancelBtn = document.getElementById('cancel-btn');

  function showNoMatchFound() {
    clearTimeout(searchTimer);
    clearTimeout(takingAWhileTimer);
    presenceSocket.emit('stop_searching');
    clearInterval(dotsInterval);
    dotsEl.textContent = '';
    document.getElementById('connect-heading-text').textContent = 'No match found';
    reassuranceEl.textContent = "Nobody's active for this topic right now. Your request is still posted, so check back soon - or try again anytime.";
    const visualEl = document.querySelector('.matching-visual');
    if (visualEl) visualEl.hidden = true;
    cancelBtn.textContent = 'Back to Home';
  }

  // Same "honest, not a fake wait" idea as showNoMatchFound() - reached
  // when clicking a specific person's community request card, but they
  // genuinely aren't online right now (see matching.py's announce-match).
  function showPartnerOffline(name) {
    clearInterval(dotsInterval);
    dotsEl.textContent = '';
    document.getElementById('connect-heading-text').textContent = "They're not online right now";
    reassuranceEl.textContent = `${name || 'This person'} isn't active at the moment - their request is still posted, so try again once they're back.`;
    const visualEl = document.querySelector('.matching-visual');
    if (visualEl) visualEl.hidden = true;
    cancelBtn.textContent = 'Back to Home';
  }

  cancelBtn.addEventListener('click', () => {
    // Stop the pending redirect/re-search below from firing after we've
    // already navigated away - without this, clicking Cancel wouldn't
    // actually cancel anything once the timer ran out.
    clearTimeout(searchTimer);
    clearTimeout(takingAWhileTimer);
    presenceSocket.emit('stop_searching');

    // Withdraw EVERY open request this person has, not just the one
    // tied to this specific search - a few searches in a row (each one
    // posts its own real request) otherwise leaves the older ones
    // sitting there looking active even after giving up entirely.
    // Fire-and-forget, same as elsewhere: navigating away shouldn't
    // wait on this.
    apiFetch('/help-requests/cancel-all', { method: 'POST' })
      .catch((error) => console.warn('Could not withdraw community requests:', error.message));

    // Always Home, not history.back() - this page is often reached via
    // an automatic redirect (a partner disconnecting, or "find someone
    // else"), so "back" can land on another stale/half-finished screen
    // instead of somewhere useful. Home is always a safe, clear landing.
    window.location.href = 'home.html';
  });

  // Once we know exactly who (or what group) we're connecting to -
  // either it was already known (a community request) or a real search
  // below just found someone - head to Match Found to show them off.
  function goToMatchFound(candidateName, candidateId, candidateCountry, reason) {
    clearTimeout(takingAWhileTimer);
    presenceSocket.emit('stop_searching');
    const matchParams = new URLSearchParams({
      subject: subject || '',
      topic: topic || '',
      level: level || '',
      with: candidateName || withName || '',
      mode,
      excludeId,
      partnerId: candidateId || partnerId,
      country: candidateCountry || country,
      requestId,
      reason: reason || '',
    });
    window.location.href = 'match-found.html?' + matchParams.toString();
  }

  // How often to quietly re-check for a real match while this screen
  // keeps animating - the SAME screen stays up the whole time (no second
  // "still searching" screen after this one) so it never feels like the
  // search restarted or got stuck.
  const SEARCH_POLL_MS = 5000;

  function searchForMatch() {
    const matchParams = new URLSearchParams({ subject: subject || '', topic: topic || '', mode });
    if (excludeId) matchParams.set('exclude', excludeId);
    apiFetch('/match-candidate?' + matchParams.toString())
      .then((data) => {
        if (data.candidate) {
          goToMatchFound(data.candidate.fullname, data.candidate.id, data.candidate.country, data.reason);
          return;
        }
        // Backup check for a match someone ELSE just made with us - the
        // live 'matched_with_you' push (see presenceSocket listener below)
        // should normally already have caught this, but a socket message
        // can drop or arrive right as a reconnect happens. Checking this
        // every poll cycle means even a missed push self-heals within one
        // SEARCH_POLL_MS interval instead of leaving this screen stuck on
        // "Finding your match" while the other person is already in Match
        // Found waiting on us.
        apiFetch('/matched-with-me')
          .then((backup) => {
            if (backup.match) {
              goToMatchFound(backup.match.partnerName, backup.match.partnerId, backup.match.partnerCountry, null);
              return;
            }
            if (Date.now() - searchStartedAt >= SEARCH_TIMEOUT_MS) {
              showNoMatchFound();
            } else {
              // Nobody real yet - the community request posted back on
              // choose-subject.html/teach-subject.html is already out there,
              // so just keep quietly checking rather than give up.
              searchTimer = setTimeout(searchForMatch, SEARCH_POLL_MS);
            }
          })
          .catch(() => {
            // The backup check itself failing shouldn't stop the search -
            // just carry on with the normal polling loop.
            if (Date.now() - searchStartedAt >= SEARCH_TIMEOUT_MS) {
              showNoMatchFound();
            } else {
              searchTimer = setTimeout(searchForMatch, SEARCH_POLL_MS);
            }
          });
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        if (Date.now() - searchStartedAt >= SEARCH_TIMEOUT_MS) {
          showNoMatchFound();
          return;
        }
        searchTimer = setTimeout(searchForMatch, SEARCH_POLL_MS);
      });
  }

  // ---------------------------------------------------------------
  // A short initial delay just for feel (so this doesn't flash by too
  // fast even on an instant match), then either hand off straight away
  // (group / already-known partner) or start actually searching.
  // ---------------------------------------------------------------
  searchTimer = setTimeout(() => {
    if (isGroup) {
      // Group sessions skip the 1-on-1 Match Found profile reveal and
      // drop straight into the group chat, same as Home's Join button
      // used to do directly - just with this screen shown first now.
      const groupParams = new URLSearchParams({
        topic: withName || '',
        subtitle: groupSubtitle,
      });
      window.location.href = 'group-chat.html?' + groupParams.toString();
      return;
    }

    if (withName) {
      // Already know exactly who (a community request) - no search or
      // "taking a while" message needed. But this is only a REAL match if
      // they're actually online right now (see matching.py's
      // announce-match) - otherwise "Match Found" would be showing
      // something that isn't really ready to start a live chat yet.
      if (partnerId) {
        apiFetch('/announce-match', {
          method: 'POST',
          body: JSON.stringify({ partnerId, subject, topic, mode }),
        })
          .then(() => goToMatchFound())
          .catch((error) => {
            if (error.status === 409) {
              showPartnerOffline(withName);
              return;
            }
            // A network/server hiccup checking online status shouldn't
            // block the match entirely - same "AI/nice-to-have features
            // never break the core flow" reasoning used elsewhere, just
            // applied to this check instead.
            console.warn('Could not announce match to partner:', error.message);
            goToMatchFound();
          });
        return;
      }
      goToMatchFound();
      return;
    }

    searchStartedAt = Date.now();
    // Tells the backend THIS person is genuinely, actively on the
    // matching screen right now - see sockets.py's searching_users. A
    // candidate is only ever offered if they're doing the exact same
    // thing at the exact same moment, not just logged in somewhere else.
    presenceSocket.emit('start_searching');
    takingAWhileTimer = setTimeout(() => {
      reassuranceEl.textContent = "This is taking a little longer than usual - hang tight, we'll connect you the moment someone's ready.";
    }, TAKING_A_WHILE_MS);
    searchForMatch();
  }, 2800);

});
