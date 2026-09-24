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
    apiFetch('/admin/reports'),
  ])
    .then(([usersData, reportsData]) => {
      document.getElementById('stat-total-users').textContent = usersData.users.length;
      document.getElementById('stat-banned-users').textContent = usersData.users.filter((u) => u.isBanned).length;

      const peopleListEl = document.getElementById('people-list');
      document.getElementById('people-count').textContent = `(${usersData.users.length})`;
      usersData.users.forEach((u) => {
        const row = document.createElement('a');
        row.className = 'people-row';
        row.href = `admin-user-detail.html?userId=${u.id}`;
        const avatar = document.createElement('span');
        avatar.className = 'people-avatar';
        avatar.textContent = (u.fullname || '?').trim().charAt(0).toUpperCase();
        const name = document.createElement('span');
        name.className = 'people-name';
        name.textContent = u.fullname + (u.isAdmin ? ' 🛡' : '') + (u.isBanned ? ' (suspended)' : '');
        const sub = document.createElement('span');
        sub.className = 'people-sub';
        sub.textContent = u.email + (u.country ? ` · ${u.country}` : '');
        const text = document.createElement('span');
        text.className = 'people-text';
        text.append(name, sub);
        row.append(avatar, text);
        peopleListEl.appendChild(row);
      });

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
