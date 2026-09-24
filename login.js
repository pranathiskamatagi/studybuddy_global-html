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
          deviceId: getDeviceId(),
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
  // FEATURE 3: Continue with Google - Google's own popup gives an access
  // token, the server checks it with Google and logs the person in (or
  // creates their account the first time).
  // ---------------------------------------------------------------
  let googleClientId = null;
  let googleTokenClient = null;

  function loadGoogleScript() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts) return resolve();
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = resolve;
      script.onerror = () => reject(new Error("Couldn't reach Google."));
      document.head.appendChild(script);
    });
  }

  async function startGoogleSignIn(button) {
    try {
      if (!googleClientId) {
        const config = await apiFetch('/auth/config');
        googleClientId = config.googleClientId;
      }
      if (!googleClientId) {
        showInfoModal("Google sign-in isn't set up yet. Please log in with your email for now.");
        return;
      }
      await loadGoogleScript();
      if (!googleTokenClient) {
        googleTokenClient = google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'openid email profile',
          callback: async (response) => {
            if (response.error || !response.access_token) return;
            button.disabled = true;
            try {
              const data = await apiFetch('/auth/google', {
                method: 'POST',
                body: JSON.stringify({ accessToken: response.access_token, deviceId: getDeviceId() }),
              });
              saveSession(data.token, data.user);
              window.location.href = 'home.html';
            } catch (error) {
              button.disabled = false;
              showInfoModal(error.message);
            }
          },
        });
      }
      googleTokenClient.requestAccessToken();
    } catch (error) {
      showInfoModal(error.message);
    }
  }

  oauthButtons.forEach((button) => {
    button.addEventListener('click', () => startGoogleSignIn(button));
  });

});
