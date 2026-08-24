document.addEventListener('DOMContentLoaded', () => {

  // Same subject -> topics lookup table as choose-subject.js / teach-subject.js.
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
  const form = document.getElementById('group-form');
  const errorMessage = document.getElementById('form-error');

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

  subjectInput.addEventListener('input', () => {
    const matchedSubject = Object.keys(subjectTopics).find(
      (name) => name.toLowerCase() === subjectInput.value.toLowerCase()
    );
    fillDatalist(topicOptions, matchedSubject ? subjectTopics[matchedSubject] : Object.keys(topicToSubject));
  });

  topicInput.addEventListener('input', () => {
    const matchedTopic = Object.keys(topicToSubject).find(
      (name) => name.toLowerCase() === topicInput.value.toLowerCase()
    );
    if (matchedTopic) {
      subjectInput.value = topicToSubject[matchedTopic];
    }
  });

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
  // Validate, then go STRAIGHT into the group chat - no matching step,
  // since creating a group doesn't need to search for a single partner.
  // ---------------------------------------------------------------
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    errorMessage.hidden = true;

    if (!subjectInput.value.trim() || !topicInput.value.trim() || !levelInput.value.trim()) {
      errorMessage.textContent = 'Please fill in a subject, topic, and level to continue.';
      errorMessage.hidden = false;
      return;
    }

    const params = new URLSearchParams({
      subject: subjectInput.value.trim(),
      topic: topicInput.value.trim(),
      level: levelInput.value.trim(),
    });
    window.location.href = 'group-chat.html?' + params.toString();
  });

});
