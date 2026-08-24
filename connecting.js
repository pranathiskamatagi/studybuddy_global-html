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
  // Animate "..." after the heading, purely for a livelier feel.
  // ---------------------------------------------------------------
  const dotsEl = document.getElementById('connect-dots');
  let dotCount = 0;

  setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    dotsEl.textContent = '.'.repeat(dotCount);
  }, 400);

  // ---------------------------------------------------------------
  // Cancel button: go back to whichever page sent us here. Falling
  // back to home.html covers the case where someone opened this page
  // directly, with no previous page in their browser history.
  // ---------------------------------------------------------------
  document.getElementById('cancel-btn').addEventListener('click', () => {
    // Stop the pending redirect below from firing after we've already
    // navigated away - without this, clicking Cancel wouldn't actually
    // cancel anything once the timer ran out.
    clearTimeout(matchTimer);

    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'home.html';
    }
  });

  // ---------------------------------------------------------------
  // After a short "searching" delay, resolve into the Match Found
  // screen - setTimeout runs a function ONCE, after N milliseconds
  // (unlike setInterval, which repeats forever).
  // ---------------------------------------------------------------
  const matchTimer = setTimeout(() => {
    const matchParams = new URLSearchParams({
      subject: subject || '',
      topic: topic || withName || '',
      level: level || '',
    });
    window.location.href = 'match-found.html?' + matchParams.toString();
  }, 2800);

});
