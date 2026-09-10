document.addEventListener('DOMContentLoaded', () => {

  // Same pattern as quiz.js and connecting.js - read whatever was passed
  // along in the URL so this screen (and the next one) stay in sync with
  // what the person picked all the way back on teach-subject.html.
  const params = new URLSearchParams(window.location.search);
  const subject = params.get('subject') || '';
  const topic = params.get('topic') || '';
  const level = params.get('level') || '';
  const mode = params.get('mode') || 'teach';
  const requestId = params.get('requestId') || '';
  // Set only when this came from quiz.js's "Help someone's real request"
  // path (home.js) - carried through so connecting.html can go straight
  // to that exact known partner instead of a generic search.
  const withName = params.get('with') || '';
  const partnerId = params.get('partnerId') || '';
  const country = params.get('country') || '';

  // Personalize the subtitle with the topic, if we have one.
  if (topic) {
    document.getElementById('tips-subtitle').textContent =
      `A few quick techniques to help your ${topic} session go smoothly.`;
  }

  document.getElementById('find-student-btn').addEventListener('click', (event) => {
    const btn = event.currentTarget;

    function goToConnecting(realRequestId) {
      // Reuses the SAME matching screen the "learn" flow ends on.
      const connectParams = new URLSearchParams({
        subject, topic, level, mode, requestId: realRequestId || requestId, with: withName, partnerId, country,
      });
      window.location.href = 'connecting.html?' + connectParams.toString();
    }

    // withName means this came from "Help someone's real request" (see
    // home.js/quiz.js's fulfillRequestId) - that request is already real
    // and already handled, nothing new to post here.
    if (withName) {
      goToConnecting();
      return;
    }

    // The generic "I wanna teach" flow - THIS is the moment the real
    // community request ("Wants to teach X" card on other people's Home)
    // should actually go live, not back on teach-subject.html. Posting it
    // only now means nobody sees "wants to teach" while this person was
    // still mid-quiz with no real intention of searching yet.
    btn.disabled = true;
    apiFetch('/help-requests', {
      method: 'POST',
      body: JSON.stringify({ mode: 'teach', subject, topic }),
    })
      .then((data) => goToConnecting(data.request.id))
      .catch((error) => {
        console.warn('Could not post a community request:', error.message);
        goToConnecting();
      });
  });

});
