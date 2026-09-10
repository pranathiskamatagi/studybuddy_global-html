document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const avatarColors = ['blue', 'green', 'pink', 'orange'];

  // Same reasoning as connecting.js - keeps this person counting as
  // "online right now" while they're looking at their match and
  // deciding whether to click Start Session.
  const presenceSocket = io(SOCKET_BASE, { auth: { token: getToken() } });

  // Someone ELSE started a real session with this person while they were
  // looking at their own match (maybe a different one) - drop them
  // straight into that chat.
  presenceSocket.on('session_started', goToStartedSession);

  // ---------------------------------------------------------------
  // Read subject/topic/level/with - same query string pattern used by
  // connecting.html, quiz.html, and teaching-tips.html.
  // ---------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const subject = params.get('subject') || '';
  const topic = params.get('topic') || '';
  const level = params.get('level') || '';
  const withName = params.get('with') || '';
  const mode = params.get('mode') || 'learn';
  // Set when connecting.html was given a REAL person's user id - either a
  // community request, or a real candidate connecting.html's own search
  // just found (see connecting.js's goToMatchFound()).
  const withPartnerId = params.get('partnerId') || '';
  const withCountry = params.get('country') || '';
  // The community request behind this search, if any - only carried
  // through so "Find someone else" can hand it back to connecting.html,
  // in case the person cancels from there (see connecting.js).
  const requestId = params.get('requestId') || '';
  // The real reason matching.py picked this specific person - only ever
  // the backend's own scoring explanation, never invented client-side.
  const reason = params.get('reason') || '';

  // This page only ever shows a CONFIRMED real match - the actual
  // searching (with its own "Finding your match" screen that keeps
  // quietly re-checking) all happens on connecting.html now, so there's
  // only ever ONE "searching" screen in the whole flow, not two. Landing
  // here without a confirmed partner only happens via a stale bookmark
  // or typing the URL directly - send it back to a real search instead.
  if (!withPartnerId) {
    const connectParams = new URLSearchParams({ subject, topic, level, mode, requestId });
    window.location.href = 'connecting.html?' + connectParams.toString();
    return;
  }

  if (typeof playMatchSound === 'function') playMatchSound();

  document.getElementById('partner-avatar').textContent = withName.charAt(0);
  document.getElementById('partner-avatar').classList.add('avatar-' + avatarColors[Number(withPartnerId) % avatarColors.length]);
  document.getElementById('partner-name').textContent = withName;
  // Not fetched here - "New study partner" is an honest enough placeholder
  // rather than a fake rating.
  document.getElementById('partner-rating').textContent = 'New study partner';

  if (topic) {
    document.getElementById('match-desc').textContent = `You're matched to connect on ${topic}.`;
  }
  document.getElementById('tag-subject').textContent = subject || 'General';
  document.getElementById('tag-country').textContent = withCountry || 'Unknown';

  if (reason) {
    const reasonEl = document.getElementById('match-reason');
    reasonEl.textContent = '✨ ' + reason;
    reasonEl.hidden = false;
  }

  document.getElementById('back-btn').addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'home.html';
    }
  });

  document.getElementById('start-session-btn').addEventListener('click', () => {
    const sessionParams = new URLSearchParams({
      partner: withName,
      color: avatarColors[Number(withPartnerId) % avatarColors.length],
      topic,
      subject,
      level,
      country: withCountry,
      flag: '',
      mode,
      partnerId: withPartnerId,
    });
    window.location.href = 'session.html?' + sessionParams.toString();
  });

  document.getElementById('find-other-btn').addEventListener('click', () => {
    // Exclude the person just shown, so the search can't just hand back
    // the exact same match again - without this, "find someone else" was
    // a no-op whenever there was only one (or one clearly best) real
    // candidate for this subject.
    const connectParams = new URLSearchParams({ subject, topic, level, mode, excludeId: withPartnerId, requestId });
    window.location.href = 'connecting.html?' + connectParams.toString();
  });

});
