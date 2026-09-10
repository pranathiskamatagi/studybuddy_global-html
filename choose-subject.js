document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  // ---------------------------------------------------------------
  // The subject -> topics relationship, in one place.
  // ---------------------------------------------------------------
  // An OBJECT here works like a lookup table: each key is a subject name,
  // and its value is an ARRAY of topics that belong to it. This is what
  // lets the Topic suggestions change based on whichever Subject is typed.
  const subjectTopics = {
    'Mathematics': ['Calculus', 'Algebra II'],
    'Computer Science': ['Python Basics', 'Data Structures'],
    'History': ['World History'],
    'Languages': ['Spanish', 'French Basics'],
    'Science': ['Physics Fundamentals', 'Biology 101'],
    'Chemistry': ['Organic Chemistry'],
  };

  const subjectInput = document.getElementById('subject');
  const topicInput = document.getElementById('topic');
  const subjectOptions = document.getElementById('subject-options');
  const topicOptions = document.getElementById('topic-options');
  const form = document.getElementById('choose-form');
  const errorMessage = document.getElementById('form-error');

  // The reverse of subjectTopics: looking up a topic tells us its subject.
  // Built once, automatically, so we never have to type each pair twice.
  const topicToSubject = {};
  Object.keys(subjectTopics).forEach((subjectName) => {
    subjectTopics[subjectName].forEach((topicName) => {
      topicToSubject[topicName] = subjectName;
    });
  });

  // Fills a <datalist> with one <option> per string in the given array.
  // Reused for both the Subject list and the Topic list below.
  function fillDatalist(datalist, values) {
    datalist.innerHTML = '';
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      datalist.appendChild(option);
    });
  }

  fillDatalist(subjectOptions, Object.keys(subjectTopics));
  fillDatalist(topicOptions, Object.keys(topicToSubject)); // every topic, right from page load

  // ---------------------------------------------------------------
  // FEATURE 1: Typing/picking a Subject narrows the Topic suggestions
  // ---------------------------------------------------------------
  // The "input" event fires on every keystroke (unlike "change", which
  // only fires once you click away) - that's what makes the suggestion
  // list feel like it's updating live as you type.
  subjectInput.addEventListener('input', () => {
    const matchedSubject = Object.keys(subjectTopics).find(
      (name) => name.toLowerCase() === subjectInput.value.toLowerCase()
    );

    if (matchedSubject) {
      fillDatalist(topicOptions, subjectTopics[matchedSubject]);
    } else {
      // Typed something that isn't (yet) an exact subject match -
      // fall back to showing every topic again.
      fillDatalist(topicOptions, Object.keys(topicToSubject));
    }
  });

  // ---------------------------------------------------------------
  // FEATURE 1b: Typing/picking a Topic directly fills in its Subject
  // ---------------------------------------------------------------
  topicInput.addEventListener('input', () => {
    const matchedTopic = Object.keys(topicToSubject).find(
      (name) => name.toLowerCase() === topicInput.value.toLowerCase()
    );
    if (matchedTopic) {
      subjectInput.value = topicToSubject[matchedTopic];
    }
  });

  // ---------------------------------------------------------------
  // FEATURE 2: Clicking a chip fills in BOTH Subject and Topic at once
  // ---------------------------------------------------------------
  // Both chip rows share this one function via event delegation, since
  // "Recent searches" and "Recommended for you" behave identically.
  function handleChipClick(event) {
    const chip = event.target.closest('.chip');
    if (!chip) return;

    subjectInput.value = chip.dataset.subject;
    topicInput.value = chip.dataset.topic;
    fillDatalist(topicOptions, subjectTopics[chip.dataset.subject] || Object.keys(topicToSubject));

    // Briefly highlight the chip that was clicked, then clear the
    // highlight from every OTHER chip on the page (across both rows).
    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip-selected'));
    chip.classList.add('chip-selected');

    errorMessage.hidden = true;
  }

  document.getElementById('recent-chips').addEventListener('click', handleChipClick);
  document.getElementById('recommended-chips').addEventListener('click', handleChipClick);

  // ---------------------------------------------------------------
  // FEATURE 2b: "Recent searches" - this user's REAL past learn
  // searches, not a hardcoded example row. Stays hidden entirely if
  // they've never searched for anything yet, rather than show fake
  // suggestions that were never actually theirs.
  // ---------------------------------------------------------------
  apiFetch('/help-requests/recent?mode=learn')
    .then((data) => {
      if (!data.recent.length) return; // stays hidden - nothing real yet
      const recentChipsEl = document.getElementById('recent-chips');
      data.recent.forEach((r) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.dataset.subject = r.subject || '';
        chip.dataset.topic = r.topic;
        chip.textContent = r.topic;
        recentChipsEl.appendChild(chip);
      });
      document.getElementById('recent-section').hidden = false;
    })
    .catch(() => {}); // stays hidden rather than show a broken-looking section

  // ---------------------------------------------------------------
  // FEATURE 3: Validate and continue to the matching screen
  // ---------------------------------------------------------------
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    errorMessage.hidden = true;

    // .trim() strips leading/trailing spaces, so someone typing just
    // spaces can't sneak past this check as "not empty".
    if (!subjectInput.value.trim() || !topicInput.value.trim()) {
      errorMessage.textContent = 'Please fill in a subject and topic to continue.';
      errorMessage.hidden = false;
      return;
    }

    // Also post a real community request (shows up as a "Help me" card
    // on OTHER people's Home/Connect). Its real id gets carried through
    // to connecting.html (see requestId below) so clicking Cancel there
    // can withdraw it again, instead of it sitting there looking active
    // after the person's already given up on it.
    apiFetch('/help-requests', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'learn',
        subject: subjectInput.value.trim(),
        topic: topicInput.value.trim(),
      }),
    })
      .then((data) => {
        const params = new URLSearchParams({
          subject: subjectInput.value.trim(),
          topic: topicInput.value.trim(),
          mode: 'learn',
          requestId: data.request.id,
        });
        window.location.href = 'connecting.html?' + params.toString();
      })
      .catch((error) => {
        console.warn('Could not post a community request:', error.message);
        // Posting the request failing shouldn't block the actual search -
        // just continue without a requestId to cancel later.
        const params = new URLSearchParams({
          subject: subjectInput.value.trim(),
          topic: topicInput.value.trim(),
          mode: 'learn',
        });
        window.location.href = 'connecting.html?' + params.toString();
      });
  });

});
