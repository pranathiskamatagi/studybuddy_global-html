document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const colors = ['blue', 'green', 'pink', 'orange'];
  // Same person always gets the same color across the app (a real avatar
  // photo isn't stored, so this is a stand-in) - picking it from their id
  // means it never randomly changes between page loads.
  function colorFor(userId) {
    return colors[userId % colors.length];
  }

  function initials(fullname) {
    return fullname.charAt(0).toUpperCase();
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
    avatarEl.textContent = initials(person.fullname);
    avatarEl.className = 'podium-avatar avatar-' + colorFor(person.id);
    if (person.online) {
      const dot = document.createElement('span');
      dot.className = 'presence-dot';
      avatarEl.appendChild(dot);
    }
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

        row.innerHTML = `
          <span class="rank-number">${index + 1}</span>
          <span class="rank-avatar avatar-${colorFor(person.id)}">${initials(person.fullname)}${person.online ? '<span class="presence-dot"></span>' : ''}</span>
          <span class="rank-name">${person.id === myId ? 'You' : person.fullname}${person.isAdmin ? ' <span class="admin-badge">🛡 Admin</span>' : ''}</span>
          <div class="rank-stats">
            <p class="rank-points">${person.points.toLocaleString()} coins</p>
            <p class="rank-diamonds">${person.diamonds} 💎</p>
          </div>
        `;

        listEl.appendChild(row);
      });
    })
    .catch(() => {
      emptyStateEl.textContent = "Couldn't load the leaderboard - please try again later.";
      emptyStateEl.hidden = false;
    });

});
