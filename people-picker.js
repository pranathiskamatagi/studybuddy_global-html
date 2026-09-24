// A reusable "pick a real person" search overlay - used by Favorites/
// Scheduled sessions/Quiz challenges' "+ Add" buttons, so those features
// don't only work when you happen to already be looking at someone's
// profile (a chat header, a group member, a search result). Same
// lazy-build-once pattern as confirm-modal.js/profile-view-modal.js.

function showPeoplePicker(onSelect) {
  let overlay = document.getElementById('people-picker-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'people-picker-overlay';
    overlay.id = 'people-picker-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="people-picker-card">
        <div class="people-picker-header">
          <p class="people-picker-title">Pick a person</p>
          <button type="button" class="people-picker-close-btn" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>
          </button>
        </div>
        <div class="people-picker-search-wrap">
          <svg class="people-picker-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>
          <input type="text" id="people-picker-input" placeholder="Search by name" />
        </div>
        <div class="people-picker-list" id="people-picker-list"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.hidden = true;
    });
    overlay.querySelector('.people-picker-close-btn').addEventListener('click', () => {
      overlay.hidden = true;
    });
  }

  const listEl = document.getElementById('people-picker-list');
  const inputEl = document.getElementById('people-picker-input');
  let debounceTimer = null;

  function initials(fullname) {
    return (fullname || '?').trim().charAt(0).toUpperCase();
  }

  function render(users) {
    listEl.innerHTML = '';
    if (users.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'people-picker-empty';
      empty.textContent = 'No one found.';
      listEl.appendChild(empty);
      return;
    }
    users.forEach((u) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'people-picker-row';

      const avatar = document.createElement('div');
      avatar.className = 'people-picker-avatar';
      if (u.photo) {
        const img = document.createElement('img');
        img.src = u.photo;
        img.alt = '';
        avatar.appendChild(img);
      } else {
        avatar.textContent = initials(u.fullname);
      }

      const name = document.createElement('span');
      name.textContent = u.country ? `${u.fullname}, ${u.country}` : u.fullname;

      row.append(avatar, name);
      row.addEventListener('click', () => {
        overlay.hidden = true;
        onSelect(u);
      });
      listEl.appendChild(row);
    });
  }

  function load(q) {
    const query = q ? `?q=${encodeURIComponent(q)}` : '';
    apiFetch(`/users/search${query}`)
      .then((data) => render(data.users))
      .catch(() => render([]));
  }

  inputEl.value = '';
  inputEl.oninput = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => load(inputEl.value.trim()), 250);
  };

  overlay.hidden = false;
  load('');
}
