document.addEventListener('DOMContentLoaded', () => {

  // No requireLogin() here on purpose - this page exists specifically
  // for someone who ISN'T logged in and can't get in.

  // Show/Hide password - same pattern as login.js, reused for both
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

  const form = document.getElementById('reset-form');
  const emailInput = document.getElementById('email');
  const newInput = document.getElementById('new-password');
  const confirmInput = document.getElementById('confirm-password');
  const errorEl = document.getElementById('form-error');
  const submitBtn = form.querySelector('.save-btn');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;

    if (!emailInput.value || !newInput.value || !confirmInput.value) {
      errorEl.textContent = 'Please fill in all fields.';
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
    submitBtn.textContent = 'Resetting...';

    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: emailInput.value.trim(),
          new_password: newInput.value,
        }),
      });
      showPointsPopup('Password reset', { icon: '✅', sub: 'You can log in with your new password now.' });
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1800);
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Reset password';
    }
  });

});
