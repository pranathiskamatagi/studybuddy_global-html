document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const listEl = document.getElementById('scheduled-list');
  const emptyStateEl = document.getElementById('empty-state');
  const myId = getStoredUser()?.id;

  const avatarColors = ['blue', 'green', 'pink', 'orange'];

  function formatWhen(iso) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  function buildRow(scheduled) {
    const iAmProposer = scheduled.proposerId === myId;
    const otherName = iAmProposer ? scheduled.inviteeName : scheduled.proposerName;

    const row = document.createElement('div');
    row.className = 'scheduled-row';

    const top = document.createElement('div');
    top.className = 'scheduled-top';
    const names = document.createElement('p');
    names.className = 'scheduled-names';
    names.textContent = `${scheduled.subject}${scheduled.topic ? ' · ' + scheduled.topic : ''}`;
    const statusTag = document.createElement('span');
    statusTag.className = 'scheduled-status-tag status-' + scheduled.status;
    statusTag.textContent = scheduled.status === 'pending' ? 'Pending' : 'Accepted';
    top.append(names, statusTag);

    const withP = document.createElement('p');
    withP.className = 'scheduled-with';
    withP.textContent = `With ${otherName}`;

    const whenP = document.createElement('p');
    whenP.className = 'scheduled-when';
    whenP.textContent = formatWhen(scheduled.scheduledFor);

    const actions = document.createElement('div');
    actions.className = 'scheduled-actions';

    if (scheduled.status === 'pending' && !iAmProposer) {
      const acceptBtn = document.createElement('button');
      acceptBtn.type = 'button';
      acceptBtn.className = 'scheduled-accept-btn';
      acceptBtn.textContent = 'Accept';
      acceptBtn.addEventListener('click', () => {
        apiFetch(`/scheduled/${scheduled.id}/accept`, { method: 'POST' }).then(load).catch((e) => alert(e.message));
      });
      const declineBtn = document.createElement('button');
      declineBtn.type = 'button';
      declineBtn.className = 'scheduled-decline-btn';
      declineBtn.textContent = 'Decline';
      declineBtn.addEventListener('click', () => {
        apiFetch(`/scheduled/${scheduled.id}/decline`, { method: 'POST' }).then(load).catch((e) => alert(e.message));
      });
      actions.append(acceptBtn, declineBtn);
    } else if (scheduled.status === 'pending' && iAmProposer) {
      const waitingP = document.createElement('p');
      waitingP.className = 'scheduled-waiting';
      waitingP.textContent = 'Waiting for them to accept...';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'scheduled-decline-btn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        apiFetch(`/scheduled/${scheduled.id}/cancel`, { method: 'POST' }).then(load).catch((e) => alert(e.message));
      });
      actions.append(waitingP, cancelBtn);
    } else if (scheduled.status === 'accepted') {
      const joinBtn = document.createElement('button');
      joinBtn.type = 'button';
      joinBtn.className = 'scheduled-accept-btn';
      joinBtn.textContent = 'Join now';
      joinBtn.addEventListener('click', () => {
        apiFetch(`/scheduled/${scheduled.id}/join`, { method: 'POST' })
          .then((data) => {
            const otherId = iAmProposer ? scheduled.inviteeId : scheduled.proposerId;
            const sessionParams = new URLSearchParams({
              partner: data.partnerName,
              color: avatarColors[Number(otherId) % avatarColors.length],
              topic: data.topic || '',
              subject: data.subject || '',
              level: '',
              country: data.partnerCountry || '',
              flag: '',
              mode: data.mode,
              partnerId: String(data.partnerId),
              // No live auto-redirect for the other person just because
              // THIS side joined first - they need to click Join
              // themselves too (see session.js's own scheduled handling).
              scheduled: '1',
            });
            window.location.href = 'session.html?' + sessionParams.toString();
          })
          .catch((error) => {
            if (error.message === 'not_yet') {
              alert("It's not time yet - come back closer to " + formatWhen(scheduled.scheduledFor) + '.');
            } else {
              alert(error.message);
            }
          });
      });
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'scheduled-decline-btn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        apiFetch(`/scheduled/${scheduled.id}/cancel`, { method: 'POST' }).then(load).catch((e) => alert(e.message));
      });
      actions.append(joinBtn, cancelBtn);
    }

    row.append(top, withP, whenP, actions);
    return row;
  }

  function load() {
    apiFetch('/scheduled')
      .then((data) => {
        listEl.innerHTML = '';
        if (data.scheduled.length === 0) {
          listEl.hidden = true;
          emptyStateEl.hidden = false;
          return;
        }
        listEl.hidden = false;
        emptyStateEl.hidden = true;
        data.scheduled.forEach((s) => listEl.appendChild(buildRow(s)));
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        listEl.hidden = true;
        emptyStateEl.hidden = false;
      });
  }

  document.getElementById('back-btn').addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });

  load();

});
