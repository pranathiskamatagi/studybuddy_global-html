document.addEventListener('DOMContentLoaded', () => {

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
  const levelInput = document.getElementById('level');
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
  // FEATURE 3: Validate and continue to the matching screen
  // ---------------------------------------------------------------
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    errorMessage.hidden = true;

    // .trim() strips leading/trailing spaces, so someone typing just
    // spaces can't sneak past this check as "not empty".
    if (!subjectInput.value.trim() || !topicInput.value.trim() || !levelInput.value.trim()) {
      errorMessage.textContent = 'Please fill in a subject, topic, and level to continue.';
      errorMessage.hidden = false;
      return;
    }

    // Reuse the SAME connecting.html screen we built for the Home page's
    // Join / Help her buttons - but this time we pass THREE separate
    // pieces of info (subject, topic, level) instead of just one.
    const params = new URLSearchParams({
      subject: subjectInput.value.trim(),
      topic: topicInput.value.trim(),
      level: levelInput.value.trim(),
    });
    window.location.href = 'connecting.html?' + params.toString();
  });

});
