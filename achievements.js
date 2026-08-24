document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // Mock achievement data (no backend yet, so this isn't tracking
  // anything real - but the UI itself is fully functional). Each one
  // has a "current" and "total" - when they're equal, it's unlocked.
  // ---------------------------------------------------------------
  const achievements = [
    {
      title: 'First Session',
      desc: 'Complete your first study session',
      current: 1, total: 1,
      reward: '+20 points',
      icon: '<path d="M20 6L9 17l-5-5"></path>',
    },
    {
      title: 'Perfect Quiz',
      desc: 'Score 5/5 on any teaching quiz',
      current: 1, total: 1,
      reward: '+30 points',
      icon: '<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4.5L6 21l1.5-7.5L2 9h7z"></path>',
    },
    {
      title: 'Top 10 Leaderboard',
      desc: 'Reach the top 10 on the leaderboard',
      current: 1, total: 1,
      reward: '🏆 Champion badge',
      icon: '<path d="M8 21h8M12 17v4"></path><path d="M17 4H7v6a5 5 0 0 0 10 0V4z"></path><path d="M7 6H4a2 2 0 0 0 2 4M17 6h3a2 2 0 0 1-2 4"></path>',
    },
    {
      title: '1,000 Points Club',
      desc: 'Earn 1,000+ total points',
      current: 1, total: 1,
      reward: '+2 diamonds',
      icon: '<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"></path>',
    },
    {
      title: '5-Session Streak',
      desc: 'Complete 5 study sessions',
      current: 3, total: 5,
      reward: '+50 points',
      icon: '<path d="M12 3c-2 3-6 5-6 9a6 6 0 0 0 12 0c0-1.5-.5-2.5-1-3.5.3 1.5-.5 2.5-1.5 2.5-1.5 0-1-2-1-2S12 12 12 3z"></path>',
    },
    {
      title: 'Polyglot Helper',
      desc: 'Learn or teach 3 different subjects',
      current: 2, total: 3,
      reward: '+3 diamonds',
      icon: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.5-4-9s1.5-6.5 4-9z"></path>',
    },
    {
      title: 'Community Helper',
      desc: 'Help 10 different students',
      current: 4, total: 10,
      reward: '🎖️ Helper badge',
      icon: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"></path>',
    },
  ];

  const listEl = document.getElementById('achievement-list');
  const unlockedCount = achievements.filter((a) => a.current >= a.total).length;

  document.getElementById('overview-title').textContent =
    `${unlockedCount} of ${achievements.length} achievements unlocked`;
  document.getElementById('overview-fill').style.width =
    `${(unlockedCount / achievements.length) * 100}%`;

  achievements.forEach((achievement) => {
    const isUnlocked = achievement.current >= achievement.total;
    const percent = Math.min(100, (achievement.current / achievement.total) * 100);

    const card = document.createElement('div');
    card.className = 'achievement-card' + (isUnlocked ? ' unlocked' : '');

    card.innerHTML = `
      <div class="achievement-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${achievement.icon}</svg>
      </div>
      <div class="achievement-body">
        <div class="achievement-header">
          <p class="achievement-title">${achievement.title}</p>
          <span class="achievement-fraction">${isUnlocked ? 'Unlocked' : `${achievement.current}/${achievement.total}`}</span>
        </div>
        <p class="achievement-desc">${achievement.desc}</p>
        <div class="achievement-track">
          <div class="achievement-fill" style="width: ${percent}%"></div>
        </div>
        <p class="achievement-reward">🎁 Reward: ${achievement.reward}</p>
      </div>
    `;

    listEl.appendChild(card);
  });

});
