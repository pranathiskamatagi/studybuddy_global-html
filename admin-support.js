document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const listEl = document.getElementById('message-list');
  const emptyStateEl = document.getElementById('empty-state');

  apiFetch('/support')
    .then((data) => {
      if (data.messages.length === 0) {
        emptyStateEl.hidden = false;
        return;
      }
      data.messages.forEach((m) => listEl.appendChild(buildCard(m)));
    })
    .catch((error) => {
      if (handleAuthError(error)) return;
      emptyStateEl.querySelector('.empty-title').textContent = "Couldn't load messages";
      emptyStateEl.querySelector('.empty-desc').textContent = error.message;
      emptyStateEl.hidden = false;
    });

  function buildCard(m) {
    const card = document.createElement('div');
    card.className = 'message-card';

    const header = document.createElement('div');
    header.className = 'message-header';

    const who = document.createElement('div');
    const senderP = document.createElement('p');
    senderP.className = 'message-sender';
    senderP.textContent = m.fullname;
    const emailP = document.createElement('p');
    emailP.className = 'message-email';
    emailP.textContent = m.email || '';
    who.append(senderP, emailP);

    const timeP = document.createElement('p');
    timeP.className = 'message-time';
    timeP.textContent = timeAgo(m.createdAt);

    header.append(who, timeP);

    const textP = document.createElement('p');
    textP.className = 'message-text';
    textP.textContent = m.message;

    card.append(header, textP);
    return card;
  }

});
