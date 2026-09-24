document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const myId = getStoredUser()?.id;
  const listEl = document.getElementById('user-list');
  const searchInput = document.getElementById('user-search');
  let allUsers = [];

  function initials(fullname) {
    return (fullname || '?').trim().charAt(0).toUpperCase();
  }

  function buildBonusForm(u) {
    const form = document.createElement('div');
    form.className = 'bonus-form';
    form.hidden = true;

    const coinsInput = document.createElement('input');
    coinsInput.type = 'number';
    coinsInput.min = '0';
    coinsInput.placeholder = 'Coins';

    const diamondsInput = document.createElement('input');
    diamondsInput.type = 'number';
    diamondsInput.min = '0';
    diamondsInput.placeholder = '💎';

    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.textContent = 'Give';
    sendBtn.addEventListener('click', () => {
      const coins = Number(coinsInput.value) || 0;
      const diamonds = Number(diamondsInput.value) || 0;
      if (coins <= 0 && diamonds <= 0) return;
      apiFetch(`/admin/users/${u.id}/grant`, {
        method: 'POST',
        body: JSON.stringify({ coins, diamonds }),
      })
        .then(() => {
          coinsInput.value = '';
          diamondsInput.value = '';
          form.hidden = true;
        })
        .catch((error) => {
          if (handleAuthError(error)) return;
          alert(error.message);
        });
    });

    form.append(coinsInput, diamondsInput, sendBtn);
    return form;
  }

  function buildMessageForm(u) {
    const form = document.createElement('div');
    form.className = 'message-form';
    form.hidden = true;

    const textInput = document.createElement('textarea');
    textInput.rows = 2;
    textInput.placeholder = `Message to ${u.fullname} only`;

    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.textContent = 'Send';
    sendBtn.addEventListener('click', () => {
      const message = textInput.value.trim();
      if (!message) return;
      apiFetch('/admin/announce', {
        method: 'POST',
        body: JSON.stringify({ message, userId: u.id }),
      })
        .then(() => {
          textInput.value = '';
          form.hidden = true;
        })
        .catch((error) => {
          if (handleAuthError(error)) return;
          alert(error.message);
        });
    });

    form.append(textInput, sendBtn);
    return form;
  }

  function buildRow(u) {
    const row = document.createElement('div');
    row.className = 'user-row' + (u.isBanned ? ' banned' : '');

    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';
    avatar.textContent = initials(u.fullname);

    const body = document.createElement('div');
    body.className = 'user-body';

    const nameP = document.createElement('p');
    nameP.className = 'user-name';
    nameP.textContent = u.fullname;
    if (u.isAdmin) {
      const badge = document.createElement('span');
      badge.className = 'admin-badge';
      badge.textContent = '🛡 Admin';
      nameP.appendChild(badge);
    }

    const emailP = document.createElement('p');
    emailP.className = 'user-email';
    emailP.textContent = u.email + (u.country ? ` · ${u.country}` : '');

    // Real gamification stats - same numbers the person sees themselves,
    // so it's obvious what someone's actually up to, not just who they are.
    const statsP = document.createElement('p');
    statsP.className = 'user-stats';
    const statParts = [
      `${(u.points || 0).toLocaleString()} coins`,
      `${u.diamonds || 0} 💎`,
      `${u.streak || 0}🔥 streak`,
      `${u.sessionCount || 0} sessions`,
    ];
    if (typeof u.rating === 'number') statParts.push(`${u.rating.toFixed(1)}★`);
    statsP.textContent = statParts.join(' · ');

    // The real "click a person, see everything" drill-down - their full
    // conversation/ratings/activity history, not just this summary row.
    const historyLink = document.createElement('a');
    historyLink.className = 'user-history-link';
    historyLink.href = `admin-user-detail.html?userId=${u.id}`;
    historyLink.textContent = 'View full history →';

    body.append(nameP, emailP, statsP, historyLink);

    if (u.isBanned) {
      const statusP = document.createElement('p');
      statusP.className = 'user-status';
      statusP.textContent = 'Suspended';
      body.appendChild(statusP);
    }

    const bonusForm = buildBonusForm(u);
    body.appendChild(bonusForm);
    const messageForm = buildMessageForm(u);
    body.appendChild(messageForm);

    row.append(avatar, body);

    if (u.id !== myId) {
      const actions = document.createElement('div');
      actions.className = 'user-actions';

      const bonusBtn = document.createElement('button');
      bonusBtn.type = 'button';
      bonusBtn.className = 'bonus-btn';
      bonusBtn.textContent = '🎁 Bonus';
      bonusBtn.addEventListener('click', () => {
        messageForm.hidden = true;
        bonusForm.hidden = !bonusForm.hidden;
      });
      actions.appendChild(bonusBtn);

      const messageBtn = document.createElement('button');
      messageBtn.type = 'button';
      messageBtn.className = 'message-btn';
      messageBtn.textContent = '💬 Message';
      messageBtn.addEventListener('click', () => {
        bonusForm.hidden = true;
        messageForm.hidden = !messageForm.hidden;
      });
      actions.appendChild(messageBtn);

      // No ban control for another admin - the backend already refuses
      // it, this just keeps the button from being offered at all.
      if (!u.isAdmin) {
        const banBtn = document.createElement('button');
        banBtn.type = 'button';
        banBtn.className = 'ban-btn' + (u.isBanned ? ' unban' : '');
        banBtn.textContent = u.isBanned ? 'Unban' : 'Ban';
        banBtn.addEventListener('click', () => {
          const action = u.isBanned ? 'unban' : 'ban';
          const message = u.isBanned
            ? `Unban ${u.fullname}? They'll be able to log in again.`
            : `Ban ${u.fullname}? They won't be able to use the app again until unbanned.`;
          showConfirmModal(message, () => {
            apiFetch(`/admin/users/${u.id}/${action}`, { method: 'POST' })
              .then(load)
              .catch((error) => {
                if (handleAuthError(error)) return;
                alert(error.message);
              });
          }, { confirmText: u.isBanned ? 'Unban' : 'Ban', danger: !u.isBanned });
        });
        actions.appendChild(banBtn);
      }

      row.appendChild(actions);
    }

    return row;
  }

  function render(users) {
    listEl.innerHTML = '';
    if (users.length === 0) {
      listEl.textContent = filterParam === 'banned' ? 'No banned accounts.' : 'No users found.';
      return;
    }
    users.forEach((u) => listEl.appendChild(buildRow(u)));
  }

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    const base = filterParam === 'banned' ? allUsers.filter((u) => u.isBanned) : allUsers;
    render(base.filter((u) => u.fullname.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
  });

  // Reached via admin.html's "Banned" stat card - pre-filters to just
  // banned accounts instead of showing everyone.
  const filterParam = new URLSearchParams(window.location.search).get('filter');

  function load() {
    apiFetch('/admin/users')
      .then((data) => {
        allUsers = data.users;
        if (filterParam === 'banned') {
          document.getElementById('user-subtitle').textContent = 'Showing banned accounts only.';
          render(allUsers.filter((u) => u.isBanned));
        } else {
          render(allUsers);
        }
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        listEl.textContent = "Couldn't load users: " + error.message;
      });
  }

  load();

});
