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

    body.append(nameP, emailP);

    if (u.isBanned) {
      const statusP = document.createElement('p');
      statusP.className = 'user-status';
      statusP.textContent = 'Suspended';
      body.appendChild(statusP);
    }

    const bonusForm = buildBonusForm(u);
    body.appendChild(bonusForm);

    row.append(avatar, body);

    if (u.id !== myId) {
      const actions = document.createElement('div');
      actions.className = 'user-actions';

      const bonusBtn = document.createElement('button');
      bonusBtn.type = 'button';
      bonusBtn.className = 'bonus-btn';
      bonusBtn.textContent = '🎁 Bonus';
      bonusBtn.addEventListener('click', () => {
        bonusForm.hidden = !bonusForm.hidden;
      });
      actions.appendChild(bonusBtn);

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
    users.forEach((u) => listEl.appendChild(buildRow(u)));
  }

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    render(allUsers.filter((u) => u.fullname.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
  });

  function load() {
    apiFetch('/admin/users')
      .then((data) => {
        allUsers = data.users;
        render(allUsers);
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        listEl.textContent = "Couldn't load users: " + error.message;
      });
  }

  load();

});
