document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  // Deciding how to draw each achievement (icon) is a frontend concern -
  // the backend only sends the key plus real title/description/reward/
  // progress/claimed/claimable data. Same 6 keys as app/achievements.py.
  const icons = {
    first_session: '<path d="M20 6L9 17l-5-5"></path>',
    perfect_quiz: '<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4.5L6 21l1.5-7.5L2 9h7z"></path>',
    top_10_leaderboard: '<path d="M8 21h8M12 17v4"></path><path d="M17 4H7v6a5 5 0 0 0 10 0V4z"></path><path d="M7 6H4a2 2 0 0 0 2 4M17 6h3a2 2 0 0 1-2 4"></path>',
    points_1000: '<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"></path>',
    session_streak_5: '<path d="M12 3c-2 3-6 5-6 9a6 6 0 0 0 12 0c0-1.5-.5-2.5-1-3.5.3 1.5-.5 2.5-1.5 2.5-1.5 0-1-2-1-2S12 12 12 3z"></path>',
    community_helper_10: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"></path>',
  };

  const listEl = document.getElementById('achievement-list');
  const overviewTitleEl = document.getElementById('overview-title');
  const overviewFillEl = document.getElementById('overview-fill');

  let achievements = [];

  load();

  function load() {
    apiFetch('/achievements')
      .then((data) => {
        achievements = data.achievements;
        render();
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        overviewTitleEl.textContent = "Couldn't load achievements";
      });
  }

  function render() {
    const claimedCount = achievements.filter((a) => a.claimed).length;

    overviewTitleEl.textContent = `${claimedCount} of ${achievements.length} achievements unlocked`;
    overviewFillEl.style.width = `${(claimedCount / achievements.length) * 100}%`;

    listEl.innerHTML = '';

    achievements.forEach((achievement) => {
      const percent = Math.min(100, (achievement.current / achievement.target) * 100);
      const stateClass = achievement.claimed ? 'claimed' : (achievement.claimable ? 'claimable' : '');

      const card = document.createElement('div');
      card.className = 'achievement-card' + (stateClass ? ' ' + stateClass : '');

      const iconWrap = document.createElement('div');
      iconWrap.className = 'achievement-icon';
      const svgNs = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNs, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.innerHTML = icons[achievement.key] || '';
      iconWrap.appendChild(svg);

      const body = document.createElement('div');
      body.className = 'achievement-body';

      const header = document.createElement('div');
      header.className = 'achievement-header';
      const titleP = document.createElement('p');
      titleP.className = 'achievement-title';
      titleP.textContent = achievement.title;
      const fractionSpan = document.createElement('span');
      fractionSpan.className = 'achievement-fraction';
      fractionSpan.textContent = achievement.claimed
        ? 'Claimed'
        : (achievement.claimable ? 'Ready!' : `${achievement.current}/${achievement.target}`);
      header.append(titleP, fractionSpan);

      const descP = document.createElement('p');
      descP.className = 'achievement-desc';
      descP.textContent = achievement.description;

      const track = document.createElement('div');
      track.className = 'achievement-track';
      const fill = document.createElement('div');
      fill.className = 'achievement-fill';
      fill.style.width = `${percent}%`;
      track.appendChild(fill);

      const rewardP = document.createElement('p');
      rewardP.className = 'achievement-reward';
      rewardP.textContent = `🎁 Reward: ${achievement.reward}`;

      body.append(header, descP, track, rewardP);

      if (achievement.claimable) {
        const claimBtn = document.createElement('button');
        claimBtn.type = 'button';
        claimBtn.className = 'claim-btn';
        claimBtn.textContent = 'Claim reward';
        claimBtn.addEventListener('click', () => handleClaim(achievement.key, claimBtn));
        body.appendChild(claimBtn);
      }

      card.append(iconWrap, body);
      listEl.appendChild(card);
    });
  }

  async function handleClaim(key, buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = 'Claiming...';
    try {
      await apiFetch(`/achievements/${key}/claim`, { method: 'POST' });
      const achievement = achievements.find((a) => a.key === key);
      showPointsPopup(achievement.reward, { icon: '🏆', sub: `${achievement.title} unlocked!` });
      load(); // re-fetch so this card (and the overview bar) reflects the real new state
    } catch (error) {
      if (handleAuthError(error)) return;
      alert("Couldn't claim that achievement: " + error.message);
      buttonEl.disabled = false;
      buttonEl.textContent = 'Claim reward';
    }
  }

});
