document.addEventListener('DOMContentLoaded', () => {

  const params = new URLSearchParams(window.location.search);
  const topic = params.get('topic') || 'your group';
  const subtitle = params.get('subtitle') || '';
  const members = params.get('members') || '';
  const minutes = params.get('minutes') || '0';
  const sessionId = params.get('sessionId') || '';
  const pointsEarned = params.get('pointsEarned') || '';
  const diamondEarned = params.get('diamondEarned') === '1';

  const summaryParts = [`${minutes} min`, topic];
  if (members) summaryParts.push(`${members} members`);
  document.getElementById('session-summary').textContent = summaryParts.join(' · ');

  if (pointsEarned) {
    showPointsPopup(`+${pointsEarned} coins`, {
      sub: diamondEarned ? 'Group session complete! +1 💎 diamond too!' : 'Group session complete!',
    });
  }

  document.getElementById('ai-summary-btn').addEventListener('click', () => {
    // "from" tells ai-summary.js's Back button to return here, not to
    // the 1-on-1 session-end.html (which expects different info).
    const aiParams = new URLSearchParams({ topic, subtitle, members, minutes, sessionId, from: 'group-session-end' });
    window.location.href = 'ai-summary.html?' + aiParams.toString();
  });

  document.getElementById('home-btn').addEventListener('click', () => {
    window.location.href = 'home.html';
  });

});
