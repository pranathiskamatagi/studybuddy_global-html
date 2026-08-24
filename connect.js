document.addEventListener('DOMContentLoaded', () => {

  // Same pattern as home.js's FEATURE 4 - these cards show multiple
  // avatars (group sessions), so Join skips matching and goes straight
  // into the group chat.
  const sessionsRow = document.getElementById('sessions-row');

  sessionsRow.addEventListener('click', (event) => {
    const button = event.target.closest('.join-btn');
    if (!button) return;

    const card = button.closest('.session-card');
    const topic = card.querySelector('h4').textContent;
    const subtitle = card.querySelector('.session-sub').textContent;

    const params = new URLSearchParams({ topic, subtitle });
    window.location.href = 'group-chat.html?' + params.toString();
  });

  // Same pattern as home.js's FEATURE 5 for "Help her" / "Learn from".
  const requestsList = document.getElementById('requests-list');

  requestsList.addEventListener('click', (event) => {
    const button = event.target.closest('.request-btn');
    if (!button) return;

    const row = button.closest('.request-row');
    const personName = row.querySelector('.request-name').textContent;

    window.location.href = 'connecting.html?with=' + encodeURIComponent(personName);
  });

});
