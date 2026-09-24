document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const listEl = document.getElementById('notif-list');
  const emptyStateEl = document.getElementById('empty-state');
  const markAllBtn = document.getElementById('mark-all-btn');
  const clearAllBtn = document.getElementById('clear-all-btn');

  // One icon per backend notification type - the backend sends plain
  // type strings ('session_invite'/'group_joined'/'rating'), not emoji,
  // since deciding how to DISPLAY something is a frontend concern.
  const icons = {
    session_invite: '💬',
    teach_request: '🙋',
    group_joined: '👥',
    group_request_interested: '👥',
    rating: '⭐',
    achievement: '🏆',
    safety_warning: '⚠️',
    security_alert: '🔒',
    bonus: '🎁',
    announcement: '📣',
    admin_cancelled: '⚠️',
    referral: '🎉',
    referral_nudge: '🎉',
    streak_milestone: '🔥',
    weekly_recap: '📊',
    quiz_challenge: '🏆',
    quiz_challenge_result: '🏆',
    quiz_challenge_reward: '🎁',
    session_scheduled: '📅',
    session_scheduled_accepted: '📅',
    session_scheduled_declined: '📅',
    session_scheduled_cancelled: '📅',
    session_scheduled_matched: '📅',
    session_scheduled_reminder: '🔔',
    session_scheduled_noshow: '⏳',
    request_unmatched: '⏳',
  };

  // A small set of types worth visually standing out from the rest -
  // things that are either time-sensitive (a scheduled session about to
  // start, someone accepting/declining) or need real attention (an
  // admin message, a safety warning) - versus the plainer "nice to
  // know" ones (a rating, a bonus, a weekly recap).
  const IMPORTANT_TYPES = new Set([
    'session_invite',
    'teach_request',
    'session_scheduled',
    'session_scheduled_accepted',
    'session_scheduled_matched',
    'session_scheduled_reminder',
    'session_scheduled_noshow',
    'request_unmatched',
    'admin_cancelled',
    'announcement',
    'safety_warning',
    'security_alert',
  ]);

  // The backend sends a real ISO timestamp, not a pre-formatted string
  // like "2 hours ago" - that phrasing changes depending on when you
  // happen to look, so it has to be computed client-side, not stored.
  function timeAgo(isoString) {
    // The backend always stores UTC timestamps, but SQLite drops the
    // timezone marker when it reads them back out, so the string here
    // looks like "2026-08-25T13:57:50" with no "+00:00"/"Z" suffix.
    // Without one, new Date() assumes LOCAL time instead of UTC, which
    // silently shifts every timestamp by your timezone offset - append
    // "Z" ourselves so it's parsed as the UTC time it actually is.
    const utcString = /[Z+-]\d\d:?\d\d$|Z$/.test(isoString) ? isoString : isoString + 'Z';
    const seconds = Math.floor((Date.now() - new Date(utcString).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  let notifications = [];

  function render() {
    listEl.innerHTML = '';

    if (notifications.length === 0) {
      emptyStateEl.hidden = false;
      markAllBtn.hidden = true;
      clearAllBtn.hidden = true;
      return;
    }
    emptyStateEl.hidden = true;
    clearAllBtn.hidden = false;

    const hasUnread = notifications.some((n) => !n.read);
    markAllBtn.disabled = !hasUnread;

    notifications.forEach((notif) => {
      // A plain div (not a <button>) since it now needs to contain a
      // REAL nested delete button - buttons can't be nested inside
      // buttons in valid HTML. role="button" keeps it keyboard/screen
      // reader accessible the same way a real button would be.
      const row = document.createElement('div');
      row.className = 'notif-row'
        + (notif.read ? '' : ' unread')
        + (IMPORTANT_TYPES.has(notif.type) ? ' notif-important' : '');
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');

      const iconEl = document.createElement('div');
      iconEl.className = 'notif-icon';
      iconEl.textContent = icons[notif.type] || '🔔';

      const body = document.createElement('div');
      body.className = 'notif-body';
      const messageP = document.createElement('p');
      messageP.className = 'notif-message';
      messageP.textContent = notif.message;
      const timeP = document.createElement('p');
      timeP.className = 'notif-time';
      timeP.textContent = timeAgo(notif.createdAt);
      body.append(messageP, timeP);

      // The referral nudge is otherwise a dead end unless you remember
      // to separately go find Invite a Friend in Profile - a real
      // one-click way to actually act on it, right here. Profile's own
      // Invite a Friend screen still exists too, for anyone who wants
      // the full picture (how many people you've referred so far).
      if (notif.type === 'referral_nudge') {
        const inviteBtn = document.createElement('button');
        inviteBtn.type = 'button';
        inviteBtn.className = 'notif-invite-btn';
        inviteBtn.textContent = '🔗 Copy invite link';
        inviteBtn.addEventListener('click', (event) => {
          event.stopPropagation(); // don't also trigger the row's own click-to-open
          const me = getStoredUser();
          if (!me) return;
          const referralLink = `${window.location.origin}/signup.html?ref=${me.id}`;
          navigator.clipboard.writeText(referralLink).then(() => {
            const original = inviteBtn.textContent;
            inviteBtn.textContent = 'Copied!';
            setTimeout(() => { inviteBtn.textContent = original; }, 1500);
          });
        });
        body.appendChild(inviteBtn);
      }

      row.append(iconEl, body);
      if (!notif.read) {
        const dot = document.createElement('span');
        dot.className = 'notif-dot-mark';
        row.appendChild(dot);
      }

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'notif-delete-btn';
      deleteBtn.setAttribute('aria-label', 'Delete notification');
      deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>';
      deleteBtn.addEventListener('click', (event) => {
        // Stops this from ALSO triggering the row's own click handler
        // below (which would mark it read and try to navigate) - a
        // delete should never also count as "opening" the notification.
        event.stopPropagation();
        deleteNotification(notif.id);
      });
      row.appendChild(deleteBtn);

      row.addEventListener('click', () => handleNotificationClick(notif));

      listEl.appendChild(row);
    });
  }

  function deleteNotification(id) {
    notifications = notifications.filter((n) => n.id !== id);
    render();
    apiFetch(`/notifications/${id}`, { method: 'DELETE' })
      .catch((error) => console.warn('Could not delete notification:', error.message));
  }

  function markReadLocally(id) {
    const target = notifications.find((n) => n.id === id);
    if (target) target.read = true;
  }

  async function handleNotificationClick(notif) {
    if (!notif.read) {
      markReadLocally(notif.id);
      render();
      apiFetch(`/notifications/${notif.id}/read`, { method: 'POST' })
        .catch((error) => console.warn('Could not mark notification read:', error.message));
    }

    // A scheduled-session proposal/update has nothing to look up via
    // sessionId (it's not a real chat yet, or it already ended) - the
    // real place to see/act on it is always Scheduled Sessions. Without
    // this, clicking one of these just marked it read and went nowhere.
    const SCHEDULED_NOTIF_TYPES = new Set([
      'session_scheduled',
      'session_scheduled_accepted',
      'session_scheduled_declined',
      'session_scheduled_cancelled',
      'session_scheduled_matched',
      'session_scheduled_reminder',
      'session_scheduled_noshow',
      'request_unmatched',
    ]);
    if (SCHEDULED_NOTIF_TYPES.has(notif.type)) {
      window.location.href = 'scheduled-sessions.html';
      return;
    }

    // A new-device login alert: the useful next step is changing the password.
    if (notif.type === 'security_alert') {
      window.location.href = 'change-password.html';
      return;
    }

    // Only session_invite/group_joined are actionable - a rating
    // notification has nowhere useful to go.
    if (!notif.sessionId) return;

    try {
      const data = await apiFetch(`/sessions/${notif.sessionId}`);
      const s = data.session;

      if (s.mode === 'group') {
        const params = new URLSearchParams({
          sessionId: s.id,
          subject: s.subject || '',
          topic: s.topic || '',
          level: s.level || '',
        });
        window.location.href = 'group-chat.html?' + params.toString();
      } else if (data.partner) {
        // A stale invite (the session already ended, or was started
        // hours ago and abandoned) has nobody left to chat with -
        // opening it just drops them into an empty "waiting for..."
        // chat, so say so instead.
        const startedMs = new Date(/[Z+-]\d\d:?\d\d$|Z$/.test(s.started_at) ? s.started_at : s.started_at + 'Z').getTime();
        if (s.ended_at || Date.now() - startedMs > 2 * 60 * 60 * 1000) {
          showInfoModal(`This study session with ${data.partner.fullname} is already over.`);
          return;
        }
        const colors = ['blue', 'green', 'pink', 'orange'];
        const params = new URLSearchParams({
          partner: data.partner.fullname,
          color: colors[data.partner.id % colors.length],
          topic: s.topic || '',
          subject: s.subject || '',
          level: s.level || '',
          country: data.partner.country || '',
          flag: '',
          mode: s.mode,
          partnerId: data.partner.id,
          // Join the session that invite is actually about, not a new one.
          sessionId: s.id,
        });
        window.location.href = 'session.html?' + params.toString();
      }
    } catch (error) {
      if (handleAuthError(error)) return;
      alert("Couldn't open that session: " + error.message);
    }
  }

  markAllBtn.addEventListener('click', () => {
    notifications.forEach((n) => { n.read = true; });
    render();
    apiFetch('/notifications/read-all', { method: 'POST' })
      .catch((error) => console.warn('Could not mark all as read:', error.message));
  });

  clearAllBtn.addEventListener('click', () => {
    showConfirmModal('Clear all notifications? This can\'t be undone.', () => {
      notifications = [];
      render();
      apiFetch('/notifications', { method: 'DELETE' })
        .catch((error) => console.warn('Could not clear notifications:', error.message));
    }, { confirmText: 'Clear all', danger: true });
  });

  // ---------------------------------------------------------------
  // Load real notifications on open - the reliable baseline that works
  // even without a live connection.
  // ---------------------------------------------------------------
  apiFetch('/notifications')
    .then((data) => {
      notifications = data.notifications;
      render();
    })
    .catch((error) => {
      if (handleAuthError(error)) return;
      emptyStateEl.querySelector('.empty-title').textContent = "Couldn't load notifications";
      emptyStateEl.querySelector('.empty-desc').textContent = error.message;
      emptyStateEl.hidden = false;
    });

  // ---------------------------------------------------------------
  // Live push - while this page is open, a brand new notification
  // appears immediately instead of waiting for a reload. Reuses the
  // SAME Socket.IO server session.js/group-chat.js already connect to;
  // the server puts every connection in a personal room automatically
  // (see sockets.py), so no session_id/join step is needed here.
  // ---------------------------------------------------------------
  const socket = io(SOCKET_BASE, { auth: { token: getToken() } });
  socket.on('new_notification', (notif) => {
    notifications.unshift(notif);
    render();

    // A rating landing live, right now, is worth celebrating the same
    // way points/diamonds are - see ratings.py, which already writes a
    // "bonus diamond" mention right into the message when it applies.
    if (notif.type === 'rating') {
      showPointsPopup(notif.message, { icon: '⭐' });
    }
  });

  // Same reasoning as home.js - drop straight into the chat the instant
  // someone else starts a real session with this person.
  socket.on('session_started', goToStartedSession);

});
