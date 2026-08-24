document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // Toggles - just visual for now (checking the CSS's :checked rule
  // does the sliding animation automatically, no JS needed for that
  // part). We only need JS if we want to REACT to the change.
  // ---------------------------------------------------------------
  document.getElementById('toggle-dark').addEventListener('change', (event) => {
    // Dark mode isn't implemented across the app yet - just confirming
    // the toggle itself works rather than silently doing nothing.
    if (event.target.checked) {
      alert("Dark mode isn't built yet, but your preference would be remembered here.");
    }
  });

  // ---------------------------------------------------------------
  // Placeholder account links
  // ---------------------------------------------------------------
  document.querySelectorAll('.link-row').forEach((row) => {
    row.addEventListener('click', () => {
      alert(`${row.dataset.action} isn't built yet.`);
    });
  });

  // ---------------------------------------------------------------
  // Log out
  // ---------------------------------------------------------------
  document.getElementById('logout-btn').addEventListener('click', () => {
    showConfirmModal('Log out of StudyBuddy Global?', () => {
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
