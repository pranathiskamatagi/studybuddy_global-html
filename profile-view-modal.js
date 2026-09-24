// A reusable "who is this?" popup - shows a LIMITED profile (name,
// country, bio, teaching tags - never points/diamonds/streak/rating, see
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
        <div class="profile-view-teaches" id="profile-view-teaches" hidden>
          <p class="profile-view-teaches-label">Teaches</p>
          <div class="profile-view-chip-row" id="profile-view-chip-row"></div>
        </div>
        <div class="profile-view-ask-row" id="profile-view-ask-row" hidden>
          <input type="text" id="ask-topic-input" placeholder="What do you want to learn?" />
          <button type="button" class="profile-view-ask-btn" id="profile-view-ask-btn">🙋 Ask them to teach you</button>
          <p class="profile-view-ask-status" id="profile-view-ask-status"></p>
        </div>
        <button type="button" class="profile-view-favorite-btn" id="profile-view-favorite-btn" hidden>
          <span id="profile-view-favorite-icon">🤍</span>
          <span id="profile-view-favorite-text">Favorite this study partner</span>
        </button>
        <div class="profile-view-challenge-row" id="profile-view-challenge-row" hidden>
          <input type="text" id="challenge-subject-input" placeholder="Subject" />
          <input type="text" id="challenge-topic-input" placeholder="Topic" />
          <button type="button" class="profile-view-challenge-btn" id="profile-view-challenge-btn">🏆 Challenge to a quiz</button>
        </div>
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
  const teachesWrap = document.getElementById('profile-view-teaches');
  const chipRow = document.getElementById('profile-view-chip-row');
  const favoriteBtn = document.getElementById('profile-view-favorite-btn');
  const favoriteIcon = document.getElementById('profile-view-favorite-icon');
  const favoriteText = document.getElementById('profile-view-favorite-text');
  const challengeRow = document.getElementById('profile-view-challenge-row');
  const askRow = document.getElementById('profile-view-ask-row');
  const askStatus = document.getElementById('profile-view-ask-status');

  avatarEl.innerHTML = '…';
  nameEl.textContent = 'Loading...';
  countryEl.textContent = '';
  bioEl.textContent = '';
  teachesWrap.hidden = true;
  favoriteBtn.hidden = true;
  challengeRow.hidden = true;
  askRow.hidden = true;
  askStatus.textContent = '';
  document.getElementById('ask-topic-input').value = '';
  overlay.hidden = false;

  const myId = typeof getStoredUser === 'function' ? getStoredUser()?.id : null;

  apiFetch(`/users/${userId}/profile-preview`)
    .then((data) => {
      const user = data.user;
      avatarEl.innerHTML = '';
      if (user.photo) {
        const img = document.createElement('img');
        img.src = user.photo;
        img.alt = '';
        avatarEl.appendChild(img);
      } else {
        avatarEl.textContent = (user.fullname || '?').trim().charAt(0).toUpperCase();
      }
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

      const reallyTeachesSomething = user.teachesSubjects && user.teachesSubjects.length > 0;
      if (reallyTeachesSomething) {
        chipRow.innerHTML = '';
        user.teachesSubjects.forEach((subject) => {
          const chip = document.createElement('span');
          chip.className = 'profile-view-chip';
          chip.textContent = subject;
          chipRow.appendChild(chip);
        });
        teachesWrap.hidden = false;
      }

      // Favoriting/scheduling with yourself makes no sense - only show
      // these for someone else's real profile.
      if (myId && Number(userId) !== Number(myId)) {
        favoriteBtn.hidden = false;
        refreshFavoriteButton(Number(userId));
        challengeRow.hidden = false;
        // "Ask them to teach you" only makes sense for someone who's
        // actually marked themselves as teaching something - asking a
        // random person with nothing in that field is just confusing.
        if (reallyTeachesSomething) askRow.hidden = false;
      }
    })
    .catch(() => {
      nameEl.textContent = "Couldn't load this profile.";
    });

  function refreshFavoriteButton(targetId) {
    apiFetch('/favorites')
      .then((data) => {
        const isFavorite = (data.favorites || []).some((f) => f.userId === targetId);
        setFavoriteBtnState(isFavorite);
      })
      .catch(() => {});
  }

  function setFavoriteBtnState(isFavorite) {
    favoriteIcon.textContent = isFavorite ? '❤️' : '🤍';
    favoriteText.textContent = isFavorite ? 'Favorited - matching prefers them' : 'Favorite this study partner';
    favoriteBtn.classList.toggle('is-favorite', isFavorite);
    favoriteBtn.dataset.favorite = isFavorite ? '1' : '0';
  }

  favoriteBtn.onclick = () => {
    const targetId = Number(userId);
    const isFavorite = favoriteBtn.dataset.favorite === '1';
    const method = isFavorite ? 'DELETE' : 'POST';
    apiFetch(`/favorites/${targetId}`, { method })
      .then(() => setFavoriteBtnState(!isFavorite))
      .catch(() => {});
  };

  document.getElementById('profile-view-challenge-btn').onclick = () => {
    const subject = document.getElementById('challenge-subject-input').value.trim();
    const topic = document.getElementById('challenge-topic-input').value.trim();
    if (!subject || !topic) return;
    const opponentName = nameEl.textContent;
    const challengeParams = new URLSearchParams({
      opponentId: String(userId), opponentName, subject, topic, level: '',
    });
    window.location.href = 'challenge-quiz.html?' + challengeParams.toString();
  };

  document.getElementById('profile-view-ask-btn').onclick = () => {
    const topic = document.getElementById('ask-topic-input').value.trim();
    if (!topic) {
      askStatus.textContent = 'What do you want to learn from them?';
      return;
    }
    apiFetch(`/users/${userId}/ask-to-teach`, {
      method: 'POST',
      body: JSON.stringify({ topic }),
    })
      .then(() => {
        askStatus.textContent = "They've been notified!";
        document.getElementById('ask-topic-input').value = '';
      })
      .catch((error) => {
        askStatus.textContent = error.message;
      });
  };
}
