document.addEventListener('DOMContentLoaded', () => {

  document.getElementById('support-btn').addEventListener('click', () => {
    window.location.href = 'contact-support.html';
  });

  // ---------------------------------------------------------------
  // Back button - reachable from BOTH the sidebar (comes from Home)
  // and Profile's "Safety Center" quick-link, so real browser history
  // is used instead of one hardcoded destination.
  // ---------------------------------------------------------------
  document.getElementById('back-btn').addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });

});
