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
    group_joined: '👥',
    rating: '⭐',
    achievement: '🏆',
    safety_warning: '⚠️',
    bonus: '🎁',
    announcement: '📣',
  };

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
      row.className = 'notif-row' + (notif.read ? '' : ' unread');
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
