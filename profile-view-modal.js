// A reusable "who is this?" popup - shows a LIMITED profile (name,
// country, bio - never points/diamonds/streak/rating, see
// User.to_limited_public_dict() on the backend) when someone clicks a
// chat partner's or group member's name/avatar. Same lazy-build-once
// pattern as confirm-modal.js/points-popup.js.

function showProfileView(userId) {
  let overlay = document.getElementById('profile-view-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'profile-view-overlay';
    overlay.id = 'profile-view-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="profile-view-card">
        <button type="button" class="profile-view-close-btn" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>
        </button>
        <div class="profile-view-avatar" id="profile-view-avatar"></div>
        <p class="profile-view-name" id="profile-view-name"></p>
        <p class="profile-view-country" id="profile-view-country"></p>
        <p class="profile-view-bio" id="profile-view-bio"></p>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.hidden = true;
    });
    overlay.querySelector('.profile-view-close-btn').addEventListener('click', () => {
      overlay.hidden = true;
    });
  }

  const avatarEl = document.getElementById('profile-view-avatar');
  const nameEl = document.getElementById('profile-view-name');
  const countryEl = document.getElementById('profile-view-country');
  const bioEl = document.getElementById('profile-view-bio');

  avatarEl.textContent = '…';
  nameEl.textContent = 'Loading...';
  countryEl.textContent = '';
  bioEl.textContent = '';
  overlay.hidden = false;

  apiFetch(`/users/${userId}/profile-preview`)
    .then((data) => {
      const user = data.user;
      avatarEl.textContent = (user.fullname || '?').trim().charAt(0).toUpperCase();
      nameEl.textContent = '';
      nameEl.append(user.fullname);
      if (user.isAdmin) {
        const badge = document.createElement('span');
        badge.className = 'admin-badge';
        badge.textContent = '🛡 Admin';
        nameEl.append(' ', badge);
      }
      countryEl.textContent = user.country || '';
      bioEl.textContent = user.bio || 'No bio yet.';
    })
    .catch((error) => {
      nameEl.textContent = "Couldn't load this profile.";
    });
}
