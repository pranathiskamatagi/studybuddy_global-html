document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // Dark mode - a real, saved preference (see dark-mode.js), applied
  // live across the whole app.
  // ---------------------------------------------------------------
  const darkToggle = document.getElementById('toggle-dark');
  darkToggle.checked = isDarkModeEnabled();
  darkToggle.addEventListener('change', (event) => {
    setDarkModeEnabled(event.target.checked);
  });

  // ---------------------------------------------------------------
  // Sound effects - a REAL preference now (see sound.js), not just a
  // visual switch. Loads whatever was saved last, and saves again every
  // time it's flipped.
  // ---------------------------------------------------------------
  const soundToggle = document.getElementById('toggle-sound');
  soundToggle.checked = soundEnabled();
  soundToggle.addEventListener('change', (event) => {
    setSoundEnabled(event.target.checked);
    if (event.target.checked) playPointsSound(); // a quick sample so it's obvious it's on
  });

  // ---------------------------------------------------------------
  // Log out
  // ---------------------------------------------------------------
  document.getElementById('logout-btn').addEventListener('click', () => {
    showConfirmModal('Log out of Learnora?', () => {
      window.location.href = 'index.html';
    }, { confirmText: 'Log out', danger: true });
  });

  // ---------------------------------------------------------------
  // Back button - reachable from BOTH the sidebar (comes from Home)
  // and Profile's "Settings" quick-link, so real browser history is
  // used instead of one hardcoded destination.
  // ---------------------------------------------------------------
  document.getElementById('back-btn').addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });

});
