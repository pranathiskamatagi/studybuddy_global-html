document.addEventListener('DOMContentLoaded', () => {

  const STORAGE_KEY = 'studybuddy_saved_summaries';
  const listEl = document.getElementById('saved-list');
  const emptyStateEl = document.getElementById('empty-state');

  function getSavedSummaries() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  function deleteSavedSummary(index) {
    const summaries = getSavedSummaries();
    // splice(index, 1) removes exactly one item at that position from
    // the array, shifting everything after it down to fill the gap.
    summaries.splice(index, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(summaries));
    render();
  }

  function openSavedSummary(item) {
    // Reopens ai-summary.html with the same info that was saved - since
    // the placeholder content is always the same for a given topic, this
    // shows the exact same mind map + summary the person saved.
    const params = new URLSearchParams({
      partner: item.partner,
      color: item.color,
      topic: item.topic,
      country: item.country,
      flag: item.flag,
    });
    window.location.href = 'ai-summary.html?' + params.toString();
  }

  function render() {
    const summaries = getSavedSummaries();
    listEl.innerHTML = '';

    if (summaries.length === 0) {
      emptyStateEl.hidden = false;
      return;
    }
    emptyStateEl.hidden = true;

    // Newest first - a copy of the array (via slice) reversed, so we
    // don't disturb the original order stored in localStorage.
    summaries.slice().reverse().forEach((item) => {
      // Find this item's REAL index in the original (non-reversed) array,
      // since that's what deleteSavedSummary() needs to remove the right one.
      const realIndex = summaries.indexOf(item);

      const card = document.createElement('div');
      card.className = 'saved-card';

      const dateText = new Date(item.savedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });

      // A summary saved from a group chat has no single "partner" -
      // only show that part of the line when one actually exists.
      const metaText = item.partner ? `with ${item.partner} &middot; ${dateText}` : dateText;

      card.innerHTML = `
        <div class="saved-icon avatar-${item.color || 'blue'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"></path><circle cx="12" cy="12" r="4"></circle></svg>
        </div>
        <div class="saved-info">
          <p class="saved-topic">${item.topic}</p>
          <p class="saved-meta">${metaText}</p>
        </div>
        <div class="saved-actions">
          <button type="button" class="saved-open-btn" aria-label="Open">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"></path></svg>
          </button>
          <button type="button" class="saved-delete-btn" aria-label="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
          </button>
        </div>
      `;

      card.querySelector('.saved-open-btn').addEventListener('click', () => openSavedSummary(item));
      card.querySelector('.saved-delete-btn').addEventListener('click', () => deleteSavedSummary(realIndex));

      listEl.appendChild(card);
    });
  }

  render();

  // ---------------------------------------------------------------
  // Back button - this page is reachable TWO ways (the sidebar, which
  // comes from Home, and Profile's "Saved" quick-link), so a single
  // hardcoded destination would be wrong for one of them. Going back
  // through real browser history always returns to wherever the
  // person actually came from.
  // ---------------------------------------------------------------
  document.getElementById('back-btn').addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault(); // stop the fallback href from firing too
      window.history.back();
    }
    // If there's no history (page opened directly), let the normal
    // href="home.html" on the link just do its thing.
  });

});
