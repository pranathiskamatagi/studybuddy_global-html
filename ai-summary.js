document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // Read the topic from the URL - session-end.js sends this when
  // "Want AI summaries and mind maps?" is clicked.
  // ---------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const topic = params.get('topic');
  const partner = params.get('partner') || '';
  const color = params.get('color') || 'blue';
  const country = params.get('country') || '';
  const flag = params.get('flag') || '';

  if (!topic) {
    window.location.href = 'home.html';
    return;
  }

  // ---------------------------------------------------------------
  // IMPORTANT: there's no AI backend yet (see the memory saved about
  // this) - a real version would send the chat transcript to an AI API
  // and get back a genuinely tailored mind map and summary. For now,
  // we show realistic-looking PLACEHOLDER content after a short fake
  // "generating" delay, so the screen itself is fully built and ready
  // to wire up to a real API later.
  // ---------------------------------------------------------------
  document.getElementById('mindmap-topic').textContent = topic;

  const summaryPoints = [
    `You covered the core building blocks and terminology of ${topic}.`,
    'Worked through real-world examples to reinforce the key ideas.',
    'Talked through common mistakes and how to avoid them.',
    'Wrapped up with a quick recap of the main takeaways.',
  ];

  const summaryListEl = document.getElementById('summary-list');
  summaryPoints.forEach((point) => {
    const li = document.createElement('li');
    li.textContent = point;
    summaryListEl.appendChild(li);
  });

  setTimeout(() => {
    document.getElementById('loading-view').hidden = true;
    document.getElementById('result-view').hidden = false;
  }, 1800);

  // ---------------------------------------------------------------
  // Save this summary + mind map so it shows up on the Saved screen.
  // ---------------------------------------------------------------
  // localStorage is a browser feature that stores small amounts of text
  // that STICK AROUND even after closing the tab or restarting the
  // browser - unlike a normal variable, which resets every page load.
  // It only stores strings, so we convert our data to/from JSON text.
  const STORAGE_KEY = 'studybuddy_saved_summaries';
  const saveBtn = document.getElementById('save-btn');
  const saveBtnText = document.getElementById('save-btn-text');

  function getSavedSummaries() {
    const raw = localStorage.getItem(STORAGE_KEY);
    // JSON.parse turns the stored TEXT back into a real array/object.
    // If nothing's been saved yet, raw is null, so we fall back to [].
    return raw ? JSON.parse(raw) : [];
  }

  function markButtonAsSaved() {
    saveBtn.classList.add('saved');
    saveBtnText.textContent = 'Saved ✓';
  }

  // If this exact topic+partner combo was already saved earlier (e.g.
  // the person navigated back here), show that immediately instead of
  // letting them save a duplicate.
  const alreadySaved = getSavedSummaries().some(
    (item) => item.topic === topic && item.partner === partner
  );
  if (alreadySaved) markButtonAsSaved();

  saveBtn.addEventListener('click', () => {
    if (saveBtn.classList.contains('saved')) return; // already saved, do nothing

    const savedSummaries = getSavedSummaries();
    savedSummaries.push({
      topic,
      partner,
      color,
      country,
      flag,
      savedAt: Date.now(), // a plain number of milliseconds - easy to sort/format later
    });

    // JSON.stringify turns our array back into TEXT, since that's all
    // localStorage is able to store.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSummaries));
    markButtonAsSaved();
  });

  document.getElementById('back-btn').addEventListener('click', () => {
    // Two different pages can link here (a 1-on-1 session-end, or a
    // group-session-end) - the "from" param tells us which one to
    // return to, so we don't send a group chat's summary back to the
    // wrong screen (which expects a "partner" that was never there).
    const returnPage = params.get('from') === 'group-session-end'
      ? 'group-session-end.html'
      : 'session-end.html';
    window.location.href = returnPage + '?' + params.toString();
  });

});
