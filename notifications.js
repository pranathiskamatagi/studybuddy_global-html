document.addEventListener('DOMContentLoaded', () => {

  const STORAGE_KEY = 'studybuddy_notifications';

  // Default notifications, tying into features already built elsewhere
  // in the app (badges, ratings, points, community requests, groups).
  // Only used the very FIRST time this page loads - after that, the
  // read/unread state is whatever's saved in localStorage.
  const defaultNotifications = [
    { id: 1, icon: '🏆', message: 'You unlocked the "Perfect Quiz" badge!', time: '2 hours ago', read: false },
    { id: 2, icon: '⭐', message: 'Aditi Rao rated you 5★ for Organic Chemistry', time: '5 hours ago', read: false },
    { id: 3, icon: '💬', message: 'Riya Sharma sent a help request for Calculus', time: '1 day ago', read: true },
    { id: 4, icon: '🎉', message: "You've reached the Top 10 leaderboard!", time: '2 days ago', read: true },
    { id: 5, icon: '👥', message: 'Marcus Chen joined your Python Basics group chat', time: '3 days ago', read: true },
    { id: 6, icon: '💎', message: 'You earned 2 diamonds from your 5-session streak', time: '4 days ago', read: true },
    { id: 7, icon: '📚', message: 'A new study group is forming for World History', time: '5 days ago', read: true },
  ];

  // getNotifications() / saveNotifications() are the ONLY two places
  // that talk to localStorage - everything else works with the plain
  // JS array, which keeps the rest of this file simple.
  function getNotifications() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : defaultNotifications;
  }
  function saveNotifications(notifications) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  }

  const listEl = document.getElementById('notif-list');
  const emptyStateEl = document.getElementById('empty-state');
  const markAllBtn = document.getElementById('mark-all-btn');

  function render() {
    const notifications = getNotifications();
    listEl.innerHTML = '';

    if (notifications.length === 0) {
      emptyStateEl.hidden = false;
      markAllBtn.hidden = true;
      return;
    }
    emptyStateEl.hidden = true;

    const hasUnread = notifications.some((n) => !n.read);
    markAllBtn.disabled = !hasUnread;

    notifications.forEach((notif) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'notif-row' + (notif.read ? '' : ' unread');

      row.innerHTML = `
        <div class="notif-icon">${notif.icon}</div>
        <div class="notif-body">
          <p class="notif-message">${notif.message}</p>
          <p class="notif-time">${notif.time}</p>
        </div>
        ${notif.read ? '' : '<span class="notif-dot-mark"></span>'}
      `;

      // Clicking any notification marks JUST that one as read.
      row.addEventListener('click', () => {
        const current = getNotifications();
        const target = current.find((n) => n.id === notif.id);
        target.read = true;
        saveNotifications(current);
        render(); // re-draw so the "unread" styling updates immediately
      });

      listEl.appendChild(row);
    });
  }

  markAllBtn.addEventListener('click', () => {
    const notifications = getNotifications();
    notifications.forEach((n) => { n.read = true; });
    saveNotifications(notifications);
    render();
  });

  // Seed localStorage on the very first visit, so home.js can read the
  // SAME data to decide whether the bell icon's red dot should show.
  if (!localStorage.getItem(STORAGE_KEY)) {
    saveNotifications(defaultNotifications);
  }

  render();

});
