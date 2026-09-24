document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('sessionId');

  const loadingView = document.getElementById('loading-view');
  const resultView = document.getElementById('result-view');
  const unavailableView = document.getElementById('unavailable-view');
  const cardEl = document.getElementById('flashcard');
  const textEl = document.getElementById('flashcard-text');
  const progressEl = document.getElementById('progress-label');

  if (!sessionId) {
    window.location.href = 'home.html';
    return;
  }

  let cards = [];
  let index = 0;
  let showingFront = true;

  function renderCard() {
    const card = cards[index];
    textEl.textContent = showingFront ? card.label : card.detail;
    cardEl.classList.toggle('flipped', !showingFront);
    progressEl.textContent = `Card ${index + 1} of ${cards.length}`;
  }

  cardEl.addEventListener('click', () => {
    showingFront = !showingFront;
    renderCard();
  });

  document.getElementById('prev-card-btn').addEventListener('click', () => {
    index = (index - 1 + cards.length) % cards.length;
    showingFront = true;
    renderCard();
  });
  document.getElementById('next-card-btn').addEventListener('click', () => {
    index = (index + 1) % cards.length;
    showingFront = true;
    renderCard();
  });

  document.getElementById('back-btn').addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'home.html';
    }
  });

  // Same cached endpoint ai-summary.js uses - a session's summary is
  // generated once and reused, so this is instant and free if the AI
  // summary was already generated for this session.
  apiFetch(`/sessions/${sessionId}/summary`, { method: 'POST' })
    .then((data) => {
      loadingView.hidden = true;
      if (!data.available || !data.branches || data.branches.length === 0) {
        unavailableView.hidden = false;
        return;
      }
      cards = data.branches
        .map((b) => (typeof b === 'string' ? { label: b, detail: '' } : b))
        .filter((b) => b.detail);
      if (cards.length === 0) {
        unavailableView.hidden = false;
        return;
      }
      renderCard();
      resultView.hidden = false;
    })
    .catch((error) => {
      if (handleAuthError(error)) return;
      loadingView.hidden = true;
      unavailableView.hidden = false;
    });

});
