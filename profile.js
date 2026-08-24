document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // If edit-profile.js has saved any changes, show those instead of
  // the hardcoded defaults already sitting in the HTML.
  // ---------------------------------------------------------------
  const saved = JSON.parse(localStorage.getItem('studybuddy_profile') || 'null');

  if (saved) {
    document.getElementById('profile-name').textContent = saved.fullname;
    // No flag emoji here since we don't have a country->flag lookup for
    // the full 195-country list edit-profile.js offers - keeping the
    // format simple and always correct beats guessing a wrong flag.
    document.getElementById('profile-meta').textContent =
      `${saved.country} · ${saved.grade} · ${saved.language}`;
    document.getElementById('profile-bio').textContent = saved.bio;
    document.getElementById('profile-avatar').textContent = saved.fullname.charAt(0).toUpperCase();
  }

  // ---------------------------------------------------------------
  // Quick links - each one now goes to a real screen.
  // ---------------------------------------------------------------
  const destinations = {
    'Editing your profile': 'edit-profile.html',
    'Saved': 'saved.html',
    'Settings': 'settings.html',
    'Safety Center': 'safety-center.html',
  };

  document.querySelectorAll('.link-row').forEach((row) => {
    row.addEventListener('click', () => {
      window.location.href = destinations[row.dataset.action];
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

});
