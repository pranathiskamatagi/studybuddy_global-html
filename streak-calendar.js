document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const gridEl = document.getElementById('calendar-grid');
  const monthLabelEl = document.getElementById('month-label');
  const currentStatEl = document.getElementById('stat-current');
  const longestStatEl = document.getElementById('stat-longest');
  const totalDaysStatEl = document.getElementById('stat-total-days');

  // Same reward numbers as backend/app/gamification.py's STREAK_MILESTONES -
  // duplicated here only because this is just DISPLAY (which ones are
  // reached, what they're worth) - the actual coins are awarded
  // server-side the moment a real streak hits one, never trusted from here.
  const STREAK_MILESTONES = { 3: 20, 7: 50, 14: 100, 30: 250, 60: 500, 100: 1000 };
  const milestonesListEl = document.getElementById('milestones-list');

  function renderMilestones(longestStreak) {
    milestonesListEl.innerHTML = '';
    Object.entries(STREAK_MILESTONES).forEach(([days, coins]) => {
      const reached = longestStreak >= Number(days);
      const row = document.createElement('div');
      row.className = 'milestone-row' + (reached ? ' reached' : '');
      const label = document.createElement('span');
      label.textContent = `🔥 ${days}-day streak`;
      const reward = document.createElement('span');
      reward.className = 'milestone-reward';
      reward.textContent = reached ? `+${coins} ✓` : `+${coins}`;
      row.append(label, reward);
      milestonesListEl.appendChild(row);
    });
  }

  function renderStreakStats(user) {
    currentStatEl.textContent = user.streak || 0;
    longestStatEl.textContent = user.longestStreak || 0;
    renderMilestones(user.longestStreak || 0);
  }
  const cachedUser = getStoredUser();
  if (cachedUser) renderStreakStats(cachedUser);
  // A fresh fetch - the cached copy can be stale (e.g. a session that
  // just ended moments ago on another tab already updated the real
  // streak, but this page's cached copy hasn't caught up yet).
  apiFetch('/auth/me').then((data) => renderStreakStats(data.user)).catch(() => {});

  let viewDate = new Date();
  viewDate.setDate(1);
  let activeDates = new Set();

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  function toDateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function render() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    monthLabelEl.textContent = `${MONTH_NAMES[month]} ${year}`;

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = toDateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

    gridEl.innerHTML = '';
    for (let i = 0; i < firstWeekday; i++) {
      const blank = document.createElement('span');
      blank.className = 'day-cell blank';
      gridEl.appendChild(blank);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const key = toDateKey(year, month, day);
      const cell = document.createElement('span');
      cell.className = 'day-cell' + (activeDates.has(key) ? ' active' : '') + (key === todayKey ? ' today' : '');
      cell.textContent = day;
      gridEl.appendChild(cell);
    }
  }

  function load() {
    apiFetch('/profile/activity-calendar')
      .then((data) => {
        activeDates = new Set(data.activeDates || []);
        totalDaysStatEl.textContent = activeDates.size;
        render();
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        render();
      });
  }

  document.getElementById('prev-month-btn').addEventListener('click', () => {
    viewDate.setMonth(viewDate.getMonth() - 1);
    render();
  });
  document.getElementById('next-month-btn').addEventListener('click', () => {
    viewDate.setMonth(viewDate.getMonth() + 1);
    render();
  });

  document.getElementById('back-btn').addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });

  load();

});
