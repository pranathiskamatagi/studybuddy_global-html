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
  const sessionId = params.get('sessionId') || '';

  // A real AI summary needs a real session (a real chat transcript to
  // read) - reaching this page without one only happens from a stale
  // link, so send them home instead of showing anything fake.
  if (!topic || !sessionId) {
    window.location.href = 'home.html';
    return;
  }

  const loadingView = document.getElementById('loading-view');
  const resultView = document.getElementById('result-view');
  const unavailableView = document.getElementById('unavailable-view');

  function renderMindMap(centralTopic, branches, summaryPoints) {
    document.getElementById('mindmap-topic').textContent = centralTopic;

    // Older cached summaries (generated before branches gained a real
    // "detail" explanation) still have the old shape - a plain string,
    // not {label, detail}. Normalize both shapes here so an already-
    // cached summary still renders fine (just with no detail text)
    // instead of breaking on branch.label being undefined.
    const normalized = branches.map((b) => (typeof b === 'string' ? { label: b, detail: '' } : b));

    // The tree diagram only has room for a short label per branch (the
    // connecting lines are drawn assuming 3 short, roughly-equal-width
    // boxes) - the REAL explanation for each one goes in the detail list
    // below instead, which can be as long as it needs to be.
    const branchesEl = document.getElementById('mindmap-branches');
    branchesEl.innerHTML = '';
    normalized.forEach((branch) => {
      const wrap = document.createElement('div');
      wrap.className = 'branch-wrap';
      const node = document.createElement('div');
      node.className = 'branch-node';
      node.textContent = branch.label;
      wrap.appendChild(node);
      branchesEl.appendChild(wrap);
    });

    const detailsEl = document.getElementById('branch-details');
    detailsEl.innerHTML = '';
    normalized.filter((branch) => branch.detail).forEach((branch) => {
      const item = document.createElement('div');
      item.className = 'branch-detail-item';
      const label = document.createElement('p');
      label.className = 'branch-detail-label';
      label.textContent = branch.label;
      const detail = document.createElement('p');
      detail.className = 'branch-detail-text';
      detail.textContent = branch.detail;
      item.append(label, detail);
      detailsEl.appendChild(item);
    });

    const summaryListEl = document.getElementById('summary-list');
    summaryListEl.innerHTML = '';
    summaryPoints.forEach((point) => {
      const li = document.createElement('li');
      li.textContent = point;
      summaryListEl.appendChild(li);
    });
  }

  // Ask the backend for a real Gemini-generated mind map/summary, based
  // on what was actually said in this session's chat. Cached server-side,
  // so revisiting this screen is instant and doesn't cost a second API call.
  apiFetch(`/sessions/${sessionId}/summary`, { method: 'POST' })
    .then((data) => {
      loadingView.hidden = true;
      if (!data.available) {
        unavailableView.hidden = false;
        return;
      }
      renderMindMap(data.centralTopic, data.branches, data.summaryPoints);
      resultView.hidden = false;
    })
    .catch((error) => {
      if (handleAuthError(error)) return;
      loadingView.hidden = true;
      unavailableView.hidden = false;
      document.querySelector('.unavailable-text').textContent =
        "Couldn't generate a summary right now: " + error.message;
    });

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
