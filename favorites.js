document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const listEl = document.getElementById('favorite-list');
  const emptyStateEl = document.getElementById('empty-state');

  function initials(fullname) {
    return (fullname || '?').trim().charAt(0).toUpperCase();
  }

  function buildRow(favorite) {
    const row = document.createElement('div');
    row.className = 'favorite-row';
    row.dataset.userId = favorite.userId;

    const avatar = document.createElement('div');
    avatar.className = 'favorite-avatar';
    if (favorite.photo) {
      const img = document.createElement('img');
      img.src = favorite.photo;
      img.alt = '';
      avatar.appendChild(img);
    } else {
      avatar.textContent = initials(favorite.fullname);
    }

    const body = document.createElement('div');
    body.className = 'favorite-body';

    const nameP = document.createElement('p');
    nameP.className = 'favorite-name';
    nameP.textContent = favorite.country ? `${favorite.fullname}, ${favorite.country}` : favorite.fullname;
    body.appendChild(nameP);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'favorite-remove-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      apiFetch(`/favorites/${favorite.userId}`, { method: 'DELETE' })
        .then(() => {
          row.remove();
          if (!listEl.children.length) {
            listEl.hidden = true;
            emptyStateEl.hidden = false;
          }
        })
        .catch((error) => {
          if (handleAuthError(error)) return;
          alert(error.message);
        });
    });

    row.append(avatar, body, removeBtn);
    return row;
  }

  function load() {
    apiFetch('/favorites')
      .then((data) => {
        listEl.innerHTML = '';
        if (data.favorites.length === 0) {
          listEl.hidden = true;
          emptyStateEl.hidden = false;
          return;
        }
        listEl.hidden = false;
        emptyStateEl.hidden = true;
        data.favorites.forEach((f) => listEl.appendChild(buildRow(f)));
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        listEl.hidden = true;
        emptyStateEl.hidden = false;
      });
  }
  load();

  // "+ Add" - the OTHER, real way to favorite someone, not only from a
  // chat you happen to already be in (see people-picker.js).
  document.getElementById('add-favorite-btn').addEventListener('click', () => {
    showPeoplePicker((person) => {
      apiFetch(`/favorites/${person.id}`, { method: 'POST' })
        .then(load)
        .catch((error) => alert(error.message));
    });
  });

  document.getElementById('back-btn').addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });

});
