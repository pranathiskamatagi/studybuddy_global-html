document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const colors = ['blue', 'green', 'pink', 'orange'];
  // Same person always gets the same color across the app, used as the
  // letter-avatar fallback when they haven't set a real photo - picking
  // it from their id means it never randomly changes between page loads.
  function colorFor(userId) {
    return colors[userId % colors.length];
  }

  function initials(fullname) {
    return fullname.charAt(0).toUpperCase();
  }

  // Fills an avatar element with a real photo if this person has one, or
  // the letter-avatar fallback otherwise - shared by the podium and the
  // full-list rows below.
  function fillAvatar(el, person) {
    el.textContent = '';
    if (person.photo) {
      el.classList.remove('avatar-' + colorFor(person.id));
      const img = document.createElement('img');
      img.src = person.photo;
      img.alt = '';
      el.appendChild(img);
    } else {
      el.classList.add('avatar-' + colorFor(person.id));
      el.textContent = initials(person.fullname);
    }
    if (person.online) {
      const dot = document.createElement('span');
      dot.className = 'presence-dot';
      el.appendChild(dot);
    }
  }

  const listEl = document.getElementById('rank-list');
  const emptyStateEl = document.getElementById('empty-state');
  const podiumEl = document.getElementById('podium');
  const myId = getStoredUser()?.id;

  function fillPodiumSlot(rank, person) {
    const col = document.getElementById(`podium-${rank}`);
    if (!person) {
      col.hidden = true;
      return;
    }
    col.hidden = false;
    const avatarEl = document.getElementById(`podium-${rank}-avatar`);
    avatarEl.className = 'podium-avatar';
    fillAvatar(avatarEl, person);
    // First name + last initial (e.g. "Sofia M.") - matches the mockup's
    // style without needing more room than the podium column has.
    const nameParts = person.fullname.trim().split(/\s+/);
    const shortName = nameParts.length > 1
      ? `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0)}.`
      : nameParts[0];
    document.getElementById(`podium-${rank}-name`).textContent = shortName;
  }

  apiFetch('/leaderboard')
    .then((data) => {
      const rankings = data.leaderboard;

      if (rankings.length === 0) {
        podiumEl.hidden = true;
        emptyStateEl.hidden = false;
        return;
      }

      fillPodiumSlot(1, rankings[0]);
      fillPodiumSlot(2, rankings[1]);
      fillPodiumSlot(3, rankings[2]);

      rankings.forEach((person, index) => {
        const row = document.createElement('div');
        row.className = 'rank-row' + (person.id === myId ? ' is-you' : '');

        const number = document.createElement('span');
        number.className = 'rank-number';
        number.textContent = index + 1;

        const avatarEl = document.createElement('span');
        avatarEl.className = 'rank-avatar';
        fillAvatar(avatarEl, person);

        const nameEl = document.createElement('span');
        nameEl.className = 'rank-name';
        nameEl.append(person.id === myId ? 'You' : person.fullname);
        if (person.isAdmin) {
          const badge = document.createElement('span');
          badge.className = 'admin-badge';
          badge.textContent = '🛡 Admin';
          nameEl.append(' ', badge);
        }

        const stats = document.createElement('div');
        stats.className = 'rank-stats';
        const pointsEl = document.createElement('p');
        pointsEl.className = 'rank-points';
        pointsEl.textContent = `${person.points.toLocaleString()} coins`;
        const diamondsEl = document.createElement('p');
        diamondsEl.className = 'rank-diamonds';
        diamondsEl.textContent = `${person.diamonds} 💎`;
        stats.append(pointsEl, diamondsEl);

        row.append(number, avatarEl, nameEl, stats);
        listEl.appendChild(row);
      });
    })
    .catch(() => {
      emptyStateEl.textContent = "Couldn't load the leaderboard - please try again later.";
      emptyStateEl.hidden = false;
    });

});
