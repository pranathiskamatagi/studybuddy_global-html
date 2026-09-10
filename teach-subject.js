document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  // ---------------------------------------------------------------
  // The subject -> topics relationship, in one place.
  // ---------------------------------------------------------------
  const subjectTopics = {
    'Mathematics': ['Calculus', 'Algebra II'],
    'Computer Science': ['Web Development', 'Data Structures'],
    'History': ['World History'],
    'Languages': ['Spanish'],
    'Science': ['Biology 101'],
    'Chemistry': ['Organic Chemistry'],
    'Arts & Writing': ['Creative Writing', 'Public Speaking'],
  };

  const subjectInput = document.getElementById('subject');
  const topicInput = document.getElementById('topic');
  const subjectOptions = document.getElementById('subject-options');
  const topicOptions = document.getElementById('topic-options');
  const form = document.getElementById('teach-form');
  const errorMessage = document.getElementById('form-error');

  // The reverse of subjectTopics: looking up a topic tells us its subject.
  const topicToSubject = {};
  Object.keys(subjectTopics).forEach((subjectName) => {
    subjectTopics[subjectName].forEach((topicName) => {
      topicToSubject[topicName] = subjectName;
    });
  });

  function fillDatalist(datalist, values) {
    datalist.innerHTML = '';
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      datalist.appendChild(option);
    });
  }

  fillDatalist(subjectOptions, Object.keys(subjectTopics));
  fillDatalist(topicOptions, Object.keys(topicToSubject));

  // ---------------------------------------------------------------
  // FEATURE 1: Typing/picking a Subject narrows the Topic suggestions
  // ---------------------------------------------------------------
  subjectInput.addEventListener('input', () => {
    const matchedSubject = Object.keys(subjectTopics).find(
      (name) => name.toLowerCase() === subjectInput.value.toLowerCase()
    );
    fillDatalist(topicOptions, matchedSubject ? subjectTopics[matchedSubject] : Object.keys(topicToSubject));
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
  function handleChipClick(event) {
    const chip = event.target.closest('.chip');
    if (!chip) return;

    subjectInput.value = chip.dataset.subject;
    topicInput.value = chip.dataset.topic;
    fillDatalist(topicOptions, subjectTopics[chip.dataset.subject] || Object.keys(topicToSubject));

    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip-selected'));
    chip.classList.add('chip-selected');

    errorMessage.hidden = true;
  }

  document.getElementById('recent-chips').addEventListener('click', handleChipClick);
  document.getElementById('recommended-chips').addEventListener('click', handleChipClick);

  // ---------------------------------------------------------------
  // "Recent searches" - this user's REAL past teach searches, not a
  // hardcoded example row - same as choose-subject.js.
  // ---------------------------------------------------------------
  apiFetch('/help-requests/recent?mode=teach')
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
  // FEATURE 3: Validate, then continue to the quiz step
  // ---------------------------------------------------------------
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    errorMessage.hidden = true;

    if (!subjectInput.value.trim() || !topicInput.value.trim()) {
      errorMessage.textContent = 'Please fill in a subject and topic to continue.';
      errorMessage.hidden = false;
      return;
    }

    // The real community request ("Wants to teach" card on OTHER
    // people's Home/Connect) is NOT posted here anymore - it used to be,
    // which meant it showed up on everyone else's Home the instant this
    // form was submitted, while this person was still taking the
    // qualifying quiz (or hadn't even started it) and had no real
    // intention of actually searching yet. It's only posted once they
    // actually click "Find a student" on teaching-tips.html, after
    // passing the quiz - see that file.
    const params = new URLSearchParams({
      subject: subjectInput.value.trim(),
      topic: topicInput.value.trim(),
      mode: 'teach',
    });
    window.location.href = 'quiz.html?' + params.toString();
  });

});
