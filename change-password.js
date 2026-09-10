document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  // Real browser history back (same pattern as settings.js's own back
  // button) instead of a plain href to settings.html - a plain link
  // always PUSHES a fresh settings.html entry, which fights with
  // settings.js's own history.back() and produces an infinite ping-pong
  // between the two pages if someone clicks Back on both in turn.
  document.getElementById('back-btn').addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });

  // Show/Hide password - same pattern as login.js, reused for all three
  // password fields via each button's data-target.
  document.querySelectorAll('.toggle-password-btn').forEach((btn) => {
    const input = document.getElementById(btn.dataset.target);
    const eyeOpenIcon = btn.querySelector('.eye-open');
    const eyeClosedIcon = btn.querySelector('.eye-closed');
    btn.addEventListener('click', () => {
      const isCurrentlyHidden = input.type === 'password';
      input.type = isCurrentlyHidden ? 'text' : 'password';
      eyeOpenIcon.hidden = isCurrentlyHidden;
      eyeClosedIcon.hidden = !isCurrentlyHidden;
      btn.setAttribute('aria-label', isCurrentlyHidden ? 'Hide password' : 'Show password');
    });
  });

  const form = document.getElementById('change-password-form');
  const currentInput = document.getElementById('current-password');
  const newInput = document.getElementById('new-password');
  const confirmInput = document.getElementById('confirm-password');
  const errorEl = document.getElementById('form-error');
  const submitBtn = form.querySelector('.save-btn');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;

    if (!currentInput.value || !newInput.value || !confirmInput.value) {
      errorEl.textContent = 'Please fill in all three fields.';
      errorEl.hidden = false;
      return;
    }
    if (newInput.value.length < 8) {
      errorEl.textContent = 'New password must be at least 8 characters.';
      errorEl.hidden = false;
      return;
    }
    if (newInput.value !== confirmInput.value) {
      errorEl.textContent = "New password and confirmation don't match.";
      errorEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating...';

    try {
      await apiFetch('/profile/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentInput.value,
          new_password: newInput.value,
        }),
      });
      form.reset();
      showPointsPopup('Password updated', { icon: '✅', sub: "You're all set - use your new password next time." });
    } catch (error) {
      if (handleAuthError(error)) return;
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Update password';
    }
  });

});
