document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const userId = new URLSearchParams(window.location.search).get('userId');
  if (!userId) {
    window.location.href = 'admin-users.html';
    return;
  }

  const avatarEl = document.getElementById('ud-avatar');
  const nameEl = document.getElementById('ud-name');
  const emailEl = document.getElementById('ud-email');
  const statsRowEl = document.getElementById('ud-stats-row');

  function statCard(label, value) {
    const card = document.createElement('div');
    card.className = 'ud-stat';
    const v = document.createElement('p');
    v.className = 'ud-stat-value';
    v.textContent = value;
    const l = document.createElement('p');
    l.className = 'ud-stat-label';
    l.textContent = label;
    card.append(v, l);
    return card;
  }

  function timeAgoOrDate(iso) {
    // Same UTC-safe parsing every other screen in this app already uses.
    const utcString = /[Z+-]\d\d:?\d\d$|Z$/.test(iso) ? iso : iso + 'Z';
    return new Date(utcString).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  function buildConversationRow(c) {
    const row = document.createElement('div');
    row.className = 'ud-row';

    const top = document.createElement('div');
    top.className = 'ud-row-top';
    const names = document.createElement('p');
    names.className = 'ud-row-title';
    names.textContent = c.otherNames.length ? `With ${c.otherNames.join(', ')}` : 'No one else (left/empty)';
    const tag = document.createElement('span');
    tag.className = 'ud-tag';
    tag.textContent = c.mode;
    top.append(names, tag);

    const topic = document.createElement('p');
    topic.className = 'ud-row-sub';
    topic.textContent = [c.subject, c.topic].filter(Boolean).join(' · ') || 'No topic';

    const bottom = document.createElement('div');
    bottom.className = 'ud-row-bottom';
    const time = document.createElement('p');
    time.className = 'ud-row-time';
    time.textContent = timeAgoOrDate(c.startedAt) + (c.endedAt ? ' · ended' : ' · ongoing');

    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'ud-view-btn';
    viewBtn.textContent = 'View chat';
    viewBtn.addEventListener('click', () => {
      window.location.href = `admin-chat-view.html?sessionId=${c.id}&mode=${c.mode}`;
    });

    bottom.append(time, viewBtn);
    row.append(top, topic, bottom);
    return row;
  }

  function buildRatingRow(r, showDelete) {
    const row = document.createElement('div');
    row.className = 'ud-row';

    const top = document.createElement('div');
    top.className = 'ud-row-top';
    const names = document.createElement('p');
    names.className = 'ud-row-title';
    names.textContent = r.otherName;
    const stars = document.createElement('span');
    stars.className = 'ud-tag ud-tag-gold';
    stars.textContent = '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars);
    top.append(names, stars);
    row.appendChild(top);

    const badge = document.createElement('p');
    badge.className = 'ud-row-sub';
    badge.textContent = r.badgeText || '';
    row.appendChild(badge);

    if (r.comment) {
      const comment = document.createElement('p');
      comment.className = 'ud-row-comment';
      comment.textContent = `"${r.comment}"`;
      row.appendChild(comment);
    }

    const bottom = document.createElement('div');
    bottom.className = 'ud-row-bottom';
    const time = document.createElement('p');
    time.className = 'ud-row-time';
    time.textContent = timeAgoOrDate(r.createdAt);
    bottom.appendChild(time);

    if (showDelete) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'ud-delete-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        showConfirmModal('Permanently delete this rating? This cannot be undone.', () => {
          apiFetch(`/admin/ratings/${r.id}`, { method: 'DELETE' })
            .then(load)
            .catch((error) => alert(error.message));
        }, { confirmText: 'Delete', danger: true });
      });
      bottom.appendChild(deleteBtn);
    }

    row.appendChild(bottom);
    return row;
  }

  function renderEmpty(container, text) {
    const p = document.createElement('p');
    p.className = 'ud-empty';
    p.textContent = text;
    container.appendChild(p);
  }

  function load() {
    apiFetch(`/admin/users/${userId}/detail`)
      .then((data) => {
        const u = data.user;
        avatarEl.textContent = (u.fullname || '?').trim().charAt(0).toUpperCase();
        nameEl.textContent = '';
        nameEl.append(u.fullname);
        if (u.isAdmin) {
          const badge = document.createElement('span');
          badge.className = 'admin-badge';
          badge.textContent = '🛡 Admin';
          nameEl.append(' ', badge);
        }
        if (u.isBanned) {
          const badge = document.createElement('span');
          badge.className = 'ud-banned-badge';
          badge.textContent = 'Banned';
          nameEl.append(' ', badge);
        }
        emailEl.textContent = `${u.email} · ${u.country || 'Unknown'} · joined ${timeAgoOrDate(u.createdAt)}`;

        statsRowEl.innerHTML = '';
        statsRowEl.append(
          statCard('Coins', u.points.toLocaleString()),
          statCard('Diamonds', u.diamonds),
          statCard('Streak', u.streak),
          statCard('Longest', u.longestStreak),
        );

        const convoPanel = document.getElementById('ud-panel-conversations');
        convoPanel.innerHTML = '';
        if (data.conversations.length === 0) {
          renderEmpty(convoPanel, 'No conversations yet.');
        } else {
          data.conversations.forEach((c) => convoPanel.appendChild(buildConversationRow(c)));
        }

        const receivedPanel = document.getElementById('ud-panel-ratings-received');
        receivedPanel.innerHTML = '';
        if (data.ratingsReceived.length === 0) {
          renderEmpty(receivedPanel, 'No ratings received yet.');
        } else {
          data.ratingsReceived.forEach((r) => receivedPanel.appendChild(buildRatingRow(r, true)));
        }

        const givenPanel = document.getElementById('ud-panel-ratings-given');
        givenPanel.innerHTML = '';
        if (data.ratingsGiven.length === 0) {
          renderEmpty(givenPanel, 'No ratings given yet.');
        } else {
          data.ratingsGiven.forEach((r) => givenPanel.appendChild(buildRatingRow(r, true)));
        }
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        nameEl.textContent = "Couldn't load this person: " + error.message;
      });
  }

  document.querySelectorAll('.ud-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ud-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.ud-panel').forEach((p) => { p.hidden = true; });
      document.getElementById(`ud-panel-${tab.dataset.tab}`).hidden = false;
    });
  });

  document.getElementById('back-btn').addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });

  load();

});
