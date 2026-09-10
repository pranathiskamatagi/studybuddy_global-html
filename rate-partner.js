document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  // ---------------------------------------------------------------
  // Read partner/topic details from the URL - session-end.js sends
  // these when "Rate your partner & give them a badge" is clicked.
  // ---------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const partnerName = params.get('partner');
  const sessionId = params.get('sessionId');
  const partnerId = params.get('partnerId') || '';

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

  document.getElementById('submit-rating-btn').addEventListener('click', async () => {
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
    if (!sessionId) {
      // Shouldn't normally happen (session.js always sends one) - but if
      // it does, there's no session on the backend to attach this to.
      rateError.textContent = "Couldn't find this session - please rate from the session-end screen.";
      rateError.hidden = false;
      return;
    }

    const submitBtn = document.getElementById('submit-rating-btn');
    submitBtn.disabled = true;

    try {
      // ratee_id is only sent when match-found.js found a REAL partner
      // (partnerId set) - a fake demo partner has no real account to
      // attach the rating to. Either way, ratee_name keeps the rating
      // readable, and the rater still gets their +10 points; only the
      // 5-star bonus diamond needs a real ratee_id to actually land.
      const commentValue = document.getElementById('comment').value.trim();
      const data = await apiFetch(`/sessions/${sessionId}/rate`, {
        method: 'POST',
        body: JSON.stringify({
          stars: selectedRating,
          badge_text: selectedBadge,
          ratee_name: partnerName,
          ratee_id: partnerId ? Number(partnerId) : undefined,
          comment: commentValue || undefined,
        }),
      });

      showPointsPopup('+10 coins', { sub: 'Thanks for rating!' });

      // A rating of 3★ or under gets one optional extra screen asking
      // what went wrong - entirely skippable, never blocks getting to
      // Home. A good rating (4-5★) skips straight to the normal
      // confirmation, same as before.
      if (selectedRating <= 3) {
        showLowRatingFollowUp(data.rating.id);
      } else {
        showConfirmation();
      }
    } catch (error) {
      if (handleAuthError(error)) return; // expired login - already redirecting
      rateError.textContent = error.message;
      rateError.hidden = false;
      submitBtn.disabled = false;
    }
  });

  function showConfirmation() {
    document.getElementById('rating-view').hidden = true;
    document.getElementById('low-rating-view').hidden = true;
    document.getElementById('confirmation-view').hidden = false;
    document.getElementById('confirmation-detail').textContent =
      `You rated ${partnerName} ${selectedRating}★ as "${selectedBadge}".`;
    // Same real confetti burst points-popup.js uses elsewhere in the app -
    // reused here (not duplicated) so this celebration moment gets the
    // same lively treatment, not a plain static checkmark.
    if (typeof _burstConfetti === 'function') {
      _burstConfetti(document.querySelector('.success-icon'));
    }
  }

  // ---------------------------------------------------------------
  // Low-rating follow-up - entirely optional, never required to reach
  // Home. Multi-select reasons (toggle, not one-at-a-time like the
  // badge picker above) since more than one thing can genuinely have
  // gone wrong in the same session.
  // ---------------------------------------------------------------
  const selectedReasons = new Set();

  document.querySelectorAll('.feedback-reason').forEach((btn) => {
    btn.addEventListener('click', () => {
      const reason = btn.dataset.reason;
      if (selectedReasons.has(reason)) {
        selectedReasons.delete(reason);
        btn.classList.remove('selected');
      } else {
        selectedReasons.add(reason);
        btn.classList.add('selected');
      }
    });
  });

  function showLowRatingFollowUp(ratingId) {
    document.getElementById('rating-view').hidden = true;
    document.getElementById('low-rating-view').hidden = false;

    function submitFeedback(reasons) {
      const detail = document.getElementById('feedback-detail').value.trim();
      // Fire-and-forget - this is purely optional feedback, so failing to
      // save it should never trap someone on this screen.
      apiFetch(`/sessions/ratings/${ratingId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ reasons, comment: detail || undefined }),
      }).catch((error) => console.warn('Could not save feedback:', error.message));
      showConfirmation();
    }

    document.getElementById('submit-feedback-btn').addEventListener('click', () => {
      submitFeedback(Array.from(selectedReasons));
    });
    document.getElementById('skip-feedback-btn').addEventListener('click', () => {
      showConfirmation();
    });
  }

  document.getElementById('continue-btn').addEventListener('click', () => {
    // Back to session-end.html (where "Rate your partner" was clicked
    // from), not all the way to Home - same history.back() pattern used
    // elsewhere (settings.js, match-found.js), with Home as the fallback
    // for the rare case this page was opened with no history at all.
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'home.html';
    }
  });

});
