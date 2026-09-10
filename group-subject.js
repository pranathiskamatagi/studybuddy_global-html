document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

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
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorMessage.hidden = true;

    const subject = subjectInput.value.trim();
    const topic = topicInput.value.trim();

    if (!subject || !topic) {
      errorMessage.textContent = 'Please fill in a subject and topic to continue.';
      errorMessage.hidden = false;
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      // Finds a real, currently-open group on this same subject+topic to
      // join, or creates a new one if none exists yet - so two people
      // picking the same thing land in the SAME group, not two separate
      // private ones.
      const data = await apiFetch('/sessions/join-or-create-group', {
        method: 'POST',
        body: JSON.stringify({ subject, topic }),
      });

      const params = new URLSearchParams({ sessionId: data.session.id, subject, topic });
      // A brand-new group has just you in it - wait for at least one
      // real other person instead of dropping straight into an empty
      // chat that looks abandoned. Joining an EXISTING group (someone's
      // already there) skips straight to the chat as before.
      window.location.href = (data.created ? 'group-waiting.html?' : 'group-chat.html?') + params.toString();
    } catch (error) {
      if (handleAuthError(error)) return;
      errorMessage.textContent = error.message;
      errorMessage.hidden = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });

});
