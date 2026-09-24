document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  // ---------------------------------------------------------------
  // Fill in the real profile - cached data first (instant), then a
  // fresh copy from the server in case edit-profile.html changed
  // something since the last login.
  // ---------------------------------------------------------------
  function renderUser(user) {
    document.getElementById('profile-name').textContent = user.fullname;
    // No flag emoji here since we don't have a country->flag lookup for
    // the full 195-country list edit-profile.js offers - keeping the
    // format simple and always correct beats guessing a wrong flag.
    const metaParts = [user.country, user.grade].filter(Boolean);
    document.getElementById('profile-meta').textContent = metaParts.join(' · ');
    document.getElementById('profile-bio').textContent = user.bio || '';

    const avatarEl = document.getElementById('profile-avatar');
    avatarEl.innerHTML = '';
    if (user.photo) {
      const img = document.createElement('img');
      img.src = user.photo;
      img.alt = '';
      avatarEl.appendChild(img);
    } else {
      avatarEl.textContent = user.fullname.charAt(0).toUpperCase();
    }

    document.getElementById('stat-points').textContent = user.points.toLocaleString();
    document.getElementById('stat-rating').textContent = (typeof user.rating === 'number') ? user.rating.toFixed(1) : 'New';
  }

  // Plain topic chips (Topics learnt/taught) - just a list of strings.
  function renderChips(containerId, items, extraClass) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'chip-empty';
      empty.textContent = 'Nothing yet';
      container.appendChild(empty);
      return;
    }
    items.forEach((text) => {
      const chip = document.createElement('span');
      chip.className = 'chip' + (extraClass ? ' ' + extraClass : '');
      chip.textContent = text;
      container.appendChild(chip);
    });
  }

  // Badge chips carry a {text, count} shape - a ×N suffix shows up only
  // when the same badge was given more than once.
  function renderBadgeChips(badges) {
    const container = document.getElementById('badges-row');
    container.innerHTML = '';
    if (badges.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'chip-empty';
      empty.textContent = 'Nothing yet';
      container.appendChild(empty);
      return;
    }
    badges.forEach((badge) => {
      const chip = document.createElement('span');
      chip.className = 'chip chip-badge';
      chip.textContent = '🎖️ ' + badge.text + (badge.count > 1 ? ` ×${badge.count}` : '');
      container.appendChild(chip);
    });
  }

  const cachedUser = getStoredUser();
  if (cachedUser) renderUser(cachedUser);

  apiFetch('/profile')
    .then((data) => {
      renderUser(data.user);
      localStorage.setItem('studybuddy_user', JSON.stringify(data.user));
      document.getElementById('stat-badges').textContent = data.badgeCount;
      renderChips('topics-learnt-row', data.topicsLearnt);
      renderChips('topics-taught-row', data.topicsTaught, 'chip-teach');
      renderBadgeChips(data.badges);
    })
    .catch((error) => {
      // Only a REAL 401 means log back in - a network hiccup or the
      // backend briefly restarting shouldn't wipe a valid session. See
      // home.js's identical fix for the same reasoning.
      handleAuthError(error);
    });

  // ---------------------------------------------------------------
  // Quick links - each one now goes to a real screen.
  // ---------------------------------------------------------------
  const destinations = {
    'Editing your profile': 'edit-profile.html',
    'Saved': 'saved.html',
    'Settings': 'settings.html',
    'Safety Center': 'safety-center.html',
    'Favorites': 'favorites.html',
    'Find a teacher': 'browse-teachers.html',
    'Scheduled sessions': 'scheduled-sessions.html',
    'Quiz challenges': 'challenges.html',
    'Invite a friend': 'invite.html',
    'Streak calendar': 'streak-calendar.html',
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
    showConfirmModal('Log out of Learnora?', () => {
      clearSession();
      window.location.href = 'index.html';
    }, { confirmText: 'Log out', danger: true });
  });

});
