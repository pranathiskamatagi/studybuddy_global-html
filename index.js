// Check if this browser already has a saved login token
const token = localStorage.getItem('studybuddy_token');

setTimeout(function () {
  if (token) {
    // Already logged in before — skip straight to Home
    window.location.href = 'home.html';
  } else {
    // First time here, or logged out — send to Signup
    window.location.href = 'signup.html';
  }
}, 3000); // matches your 3-second loading bar animation