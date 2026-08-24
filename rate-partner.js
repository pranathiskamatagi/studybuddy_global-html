document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // Read partner/topic details from the URL - session-end.js sends
  // these when "Rate your partner & give them a badge" is clicked.
  // ---------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const partnerName = params.get('partner');

  // This page should never be opened with no partner info at all - that
  // only happens from a stale bookmark/tab or typing the URL directly.
  // Same fix as connecting.html: send them back to Home instead of
  // showing a broken generic screen.
  if (!partnerName) {
    window.location.href = 'home.html';
    return;
  }

  const country = params.get('country') || '';
  const flag = params.get('flag') || '';
  const topic = params.get('topic') || '';

  const nameCountry = flag && country ? `${partnerName}, ${flag} ${country}` : partnerName;
  document.getElementById('summary-name-country').textContent = nameCountry;
  document.getElementById('summary-topic').textContent = topic ? `Topic learnt: ${topic}` : '';

  // ---------------------------------------------------------------
  // Star rating - same fill-up-to-value pattern as everywhere else
  // this pattern is used in the app.
  // ---------------------------------------------------------------
  const starButtons = document.querySelectorAll('.star-btn');
  let selectedRating = 0;

  function paintStars(upToValue) {
    starButtons.forEach((star) => {
      star.classList.toggle('filled', Number(star.dataset.value) <= upToValue);
    });
  }

  starButtons.forEach((star) => {
    star.addEventListener('click', () => {
      selectedRating = Number(star.dataset.value);
      paintStars(selectedRating);
    });
    star.addEventListener('mouseenter', () => paintStars(Number(star.dataset.value)));
    star.addEventListener('mouseleave', () => paintStars(selectedRating));
  });

  // ---------------------------------------------------------------
  // Badge picker: 3 presets, PLUS a "Choose my own" option that reveals
  // a text input. Only one badge (preset or custom) can be active.
  // ---------------------------------------------------------------
  const badgeButtons = document.querySelectorAll('.badge-option');
  const chooseOwnBtn = document.getElementById('choose-own-btn');
  const customBadgeInput = document.getElementById('custom-badge-input');
  let selectedBadge = null;

  function clearBadgeSelection() {
    badgeButtons.forEach((b) => b.classList.remove('selected'));
    chooseOwnBtn.classList.remove('selected');
  }

  badgeButtons.forEach((badge) => {
    badge.addEventListener('click', () => {
      clearBadgeSelection();
      badge.classList.add('selected');
      selectedBadge = badge.dataset.badge;
      customBadgeInput.hidden = true;
    });
  });

  chooseOwnBtn.addEventListener('click', () => {
    clearBadgeSelection();
    chooseOwnBtn.classList.add('selected');
    customBadgeInput.hidden = false;
    customBadgeInput.focus();
    // Nothing typed yet, so there's no valid badge until they type one.
    selectedBadge = customBadgeInput.value.trim() || null;
  });

  // Keeps selectedBadge in sync as they type a custom badge name.
  customBadgeInput.addEventListener('input', () => {
    selectedBadge = customBadgeInput.value.trim() || null;
  });

  // ---------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------
  const rateError = document.getElementById('rate-error');

  document.getElementById('submit-rating-btn').addEventListener('click', () => {
    rateError.hidden = true;

    if (selectedRating === 0) {
      rateError.textContent = 'Please pick a star rating.';
      rateError.hidden = false;
      return;
    }
    if (!selectedBadge) {
      rateError.textContent = 'Please choose a badge (or type your own).';
      rateError.hidden = false;
      return;
    }

    // No backend yet, so this doesn't actually save anywhere - we just
    // confirm it worked, the same honest-placeholder approach used for
    // every other not-yet-connected feature in this app.
    document.getElementById('rating-view').hidden = true;
    document.getElementById('confirmation-view').hidden = false;
    document.getElementById('confirmation-detail').textContent =
      `You rated ${partnerName} ${selectedRating}★ as "${selectedBadge}".`;
  });

  document.getElementById('continue-btn').addEventListener('click', () => {
    window.location.href = 'home.html';
  });

});
