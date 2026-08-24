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
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    errorMessage.hidden = true;

    const emailInput = document.getElementById('email');

    if (emailInput.value.trim() === '' || passwordInput.value.trim() === '') {
      errorMessage.textContent = 'Please fill in both fields.';
      errorMessage.hidden = false;
      return;
    }

    // Same as signup.js - no real backend to check credentials against
    // yet, but the flow itself takes you into the app like it should.
    window.location.href = 'home.html';
  });

  // ---------------------------------------------------------------
  // FEATURE 2b: "Forgot password?" - not built yet
  // ---------------------------------------------------------------
  document.querySelector('.forgot-link').addEventListener('click', (event) => {
    event.preventDefault(); // stops the href="#" from jumping the page to the top
    alert("Password reset isn't built yet - coming in a future update!");
  });

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
