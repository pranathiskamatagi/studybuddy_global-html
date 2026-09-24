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

  // ---------------------------------------------------------------
  // Schedule for later - same idea as choose-subject.js's own version,
  // just for the "teach" side. Not shown at all for "help someone's real
  // request" (withName set) - there's already a specific real person and
  // time doesn't need scheduling around.
  // ---------------------------------------------------------------
  const scheduleToggleBtn = document.getElementById('schedule-later-toggle-btn');
  if (withName) {
    scheduleToggleBtn.hidden = true;
  } else {
    const scheduleForm = document.getElementById('schedule-later-form');
    const scheduleSubmitBtn = document.getElementById('schedule-later-submit-btn');
    const scheduleError = document.getElementById('schedule-later-error');

    // A real calendar + time-slot picker (see date-time-picker.js)
    // instead of the browser's own unstyleable native date/time popups.
    let chosenDateTime = null;
    initDateTimePicker('schedule-later-datetime', (value) => {
      chosenDateTime = value;
    });

    scheduleToggleBtn.addEventListener('click', () => {
      scheduleForm.hidden = !scheduleForm.hidden;
      if (!scheduleForm.hidden) {
        scheduleForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    // Optional: pick a specific person to teach, instead of an open
    // request anyone can answer. No "recommended" list here (unlike the
    // learn side) - there's no "wants to learn X" self-tag to search
    // against, just a real search for anyone. See routes/scheduled.py's
    // decline_scheduled for what happens if they can't make it.
    const pickPersonToggleBtn = document.getElementById('pick-person-toggle-btn');
    const pickPersonPanel = document.getElementById('pick-person-panel');
    const pickPersonSearchBtn = document.getElementById('pick-person-search-btn');
    const pickPersonChosen = document.getElementById('pick-person-chosen');
    const pickPersonChosenName = document.getElementById('pick-person-chosen-name');
    const pickPersonClearBtn = document.getElementById('pick-person-clear-btn');

    let chosenPersonId = null;
    let chosenPersonName = null;

    pickPersonToggleBtn.addEventListener('click', () => {
      pickPersonPanel.hidden = !pickPersonPanel.hidden;
    });

    pickPersonSearchBtn.addEventListener('click', () => {
      showPeoplePicker((person) => {
        chosenPersonId = person.id;
        chosenPersonName = person.fullname;
        pickPersonChosenName.textContent = person.fullname;
        pickPersonChosen.hidden = false;
        scheduleSubmitBtn.textContent = 'Send request';
      });
    });

    pickPersonClearBtn.addEventListener('click', () => {
      chosenPersonId = null;
      chosenPersonName = null;
      pickPersonChosen.hidden = true;
      scheduleSubmitBtn.textContent = 'Post request';
    });

    scheduleSubmitBtn.addEventListener('click', () => {
      scheduleError.hidden = true;

      if (!chosenDateTime) {
        scheduleError.textContent = 'Pick a real date and time first.';
        scheduleError.hidden = false;
        return;
      }
      if (chosenDateTime.getTime() <= Date.now()) {
        scheduleError.textContent = 'Pick a time in the future.';
        scheduleError.hidden = false;
        return;
      }

      scheduleSubmitBtn.disabled = true;

      if (chosenPersonId) {
        apiFetch('/scheduled', {
          method: 'POST',
          body: JSON.stringify({
            inviteeId: chosenPersonId, subject, topic, mode: 'teach',
            scheduledFor: chosenDateTime.toISOString(), openToOthers: true,
          }),
        })
          .then(() => {
            alert(`Invite sent to ${chosenPersonName}! If they can't make it, this'll go back to an open request.`);
            window.location.href = 'home.html';
          })
          .catch((error) => {
            if (handleAuthError(error)) return;
            scheduleSubmitBtn.disabled = false;
            scheduleError.textContent = error.message;
            scheduleError.hidden = false;
          });
        return;
      }

      apiFetch('/help-requests', {
        method: 'POST',
        body: JSON.stringify({ mode: 'teach', subject, topic, scheduledFor: chosenDateTime.toISOString() }),
      })
        .then(() => {
          showInfoModal("Request posted! We'll notify you once we find you a partner for that time.", {
            onClose: () => { window.location.href = 'home.html'; },
          });
        })
        .catch((error) => {
          if (handleAuthError(error)) return;
          scheduleSubmitBtn.disabled = false;
          scheduleError.textContent = error.message;
          scheduleError.hidden = false;
        });
    });
  }

});
