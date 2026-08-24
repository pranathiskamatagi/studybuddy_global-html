document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // Mock leaderboard data. Ranks 1-3 are already drawn on the podium
  // above (in the HTML), so this list covers ranks 1-10 for the full
  // ranked list below it - the isYou flag marks the signed-in user's
  // own row so we can highlight it differently.
  // ---------------------------------------------------------------
  const rankings = [
    { name: 'Aditi Rao',       color: 'blue',   points: 10000, diamonds: 5 },
    { name: 'Sofia Martinez',  color: 'pink',   points: 800,   diamonds: 7 },
    { name: 'Kabir Singh',     color: 'orange', points: 750,   diamonds: 6 },
    { name: 'Marcus Chen',     color: 'green',  points: 700,   diamonds: 4 },
    { name: 'Emma Wilson',     color: 'blue',   points: 650,   diamonds: 3 },
    { name: 'Ravi Patel',      color: 'green',  points: 620,   diamonds: 3 },
    { name: "Liam O'Brien",    color: 'orange', points: 610,   diamonds: 2 },
    { name: 'Zara Ahmed',      color: 'pink',   points: 605,   diamonds: 2 },
    { name: 'Noah Kim',        color: 'blue',   points: 602,   diamonds: 2 },
    { name: 'You',             color: 'green',  points: 600,   diamonds: 2, isYou: true },
  ];

  const listEl = document.getElementById('rank-list');

  rankings.forEach((person, index) => {
    const row = document.createElement('div');
    row.className = 'rank-row' + (person.isYou ? ' is-you' : '');

    row.innerHTML = `
      <span class="rank-number">${index + 1}</span>
      <span class="rank-avatar avatar-${person.color}">${person.name.charAt(0)}</span>
      <span class="rank-name">${person.name}</span>
      <div class="rank-stats">
        <p class="rank-points">${person.points.toLocaleString()} pts</p>
        <p class="rank-diamonds">${person.diamonds} 💎</p>
      </div>
    `;

    listEl.appendChild(row);
  });

});
