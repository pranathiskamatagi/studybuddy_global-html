document.addEventListener('DOMContentLoaded', () => {

  // Same pattern as quiz.js and connecting.js - read whatever was passed
  // along in the URL so this screen (and the next one) stay in sync with
  // what the person picked all the way back on teach-subject.html.
  const params = new URLSearchParams(window.location.search);
  const subject = params.get('subject') || '';
  const topic = params.get('topic') || '';
  const level = params.get('level') || '';

  // Personalize the subtitle with the topic, if we have one.
  if (topic) {
    document.getElementById('tips-subtitle').textContent =
      `A few quick techniques to help your ${topic} session go smoothly.`;
  }

  document.getElementById('find-student-btn').addEventListener('click', () => {
    // Reuses the SAME matching screen the "learn" flow ends on.
    const connectParams = new URLSearchParams({ subject, topic, level });
    window.location.href = 'connecting.html?' + connectParams.toString();
  });

});
