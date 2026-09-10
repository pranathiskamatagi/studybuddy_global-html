document.addEventListener('DOMContentLoaded', () => {

  const form = document.getElementById('login-form');
  const passwordInput = document.getElementById('password');
  const toggleBtn = document.getElementById('toggle-password');
  const eyeOpenIcon = toggleBtn.querySelector('.eye-open');
  const eyeClosedIcon = toggleBtn.querySelector('.eye-closed');
  const errorMessage = document.getElementById('form-error');
  const oauthButtons = document.querySelectorAll('.oauth-button');

  // ---------------------------------------------------------------
  // FEATURE 1: Show/Hide password (same pattern as signup.js)
  // ---------------------------------------------------------------
  toggleBtn.addEventListener('click', () => {
    const isCurrentlyHidden = passwordInput.type === 'password';
    passwordInput.type = isCurrentlyHidden ? 'text' : 'password';
    eyeOpenIcon.hidden = isCurrentlyHidden;
    eyeClosedIcon.hidden = !isCurrentlyHidden;
    toggleBtn.setAttribute('aria-label', isCurrentlyHidden ? 'Hide password' : 'Show password');
  });

  // ---------------------------------------------------------------
  // FEATURE 2: Validate and handle the login form
  // ---------------------------------------------------------------
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorMessage.hidden = true;

    const emailInput = document.getElementById('email');

    if (emailInput.value.trim() === '' || passwordInput.value.trim() === '') {
      errorMessage.textContent = 'Please fill in both fields.';
      errorMessage.hidden = false;
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: emailInput.value.trim(),
          password: passwordInput.value,
        }),
      });

      saveSession(data.token, data.user);
      window.location.href = 'home.html';
    } catch (error) {
      errorMessage.textContent = error.message;
      errorMessage.hidden = false;
      submitBtn.disabled = false;
    }
  });

  // ---------------------------------------------------------------
  // FEATURE 2b: "Forgot password?" - real page now (forgot-password.html)
  // ---------------------------------------------------------------
  // No click handler needed - see login.html, its href now points there
  // directly instead of "#".

  // ---------------------------------------------------------------
  // FEATURE 3: Placeholder handlers for the Google/Apple buttons
  // ---------------------------------------------------------------
  // Both buttons need near-identical behavior right now, so instead of
  // writing two separate functions, we loop over both buttons and attach
  // the SAME function to each one. This is called "reusing a function."
  oauthButtons.forEach((button) => {
    button.addEventListener('click', () => {
      // data-provider reads the custom data-provider="Google"/"Apple"
      // attribute we set in the HTML, so one function can handle both.
      const provider = button.dataset.provider;
      alert(`${provider} sign-in isn't connected yet - we'll wire this up once we build the backend.`);
    });
  });

});
