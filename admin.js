document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  // The real security is server-side (every /api/admin/* route checks
  // is_admin itself) - this is just so a non-admin who somehow lands on
  // this URL directly gets sent somewhere useful instead of a page full
  // of buttons that would just 403 anyway.
  const user = getStoredUser();
  if (!user?.isAdmin) {
    window.location.href = 'home.html';
    return;
  }

  // A quick dashboard overview - real numbers, cheap to compute from data
  // the individual screens already fetch anyway.
  Promise.all([
    apiFetch('/admin/users'),
    apiFetch('/admin/sessions'),
    apiFetch('/admin/reports'),
  ])
    .then(([usersData, sessionsData, reportsData]) => {
      document.getElementById('stat-total-users').textContent = usersData.users.length;
      document.getElementById('stat-total-sessions').textContent = sessionsData.sessions.length;
      document.getElementById('stat-banned-users').textContent = usersData.users.filter((u) => u.isBanned).length;

      const openReports = reportsData.reports.filter((r) => !r.reviewed).length;
      document.getElementById('stat-open-reports').textContent = openReports;
      if (openReports > 0) {
        const badge = document.getElementById('pending-reports-count');
        badge.textContent = openReports;
        badge.hidden = false;
      }
    })
    .catch((error) => {
      if (handleAuthError(error)) return;
      console.warn('Could not load admin stats:', error.message);
    });

});
