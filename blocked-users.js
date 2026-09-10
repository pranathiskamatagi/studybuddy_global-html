document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const listEl = document.getElementById('block-list');
  const emptyStateEl = document.getElementById('empty-state');

  function initials(fullname) {
    return (fullname || '?').trim().charAt(0).toUpperCase();
  }

  function buildRow(block) {
    const row = document.createElement('div');
    row.className = 'block-row';
    row.dataset.userId = block.userId;

    const avatar = document.createElement('div');
    avatar.className = 'block-avatar';
    avatar.textContent = initials(block.fullname);

    const body = document.createElement('div');
    body.className = 'block-body';

    const nameP = document.createElement('p');
    nameP.className = 'block-name';
    nameP.textContent = block.country ? `${block.fullname}, ${block.country}` : block.fullname;

    const metaP = document.createElement('p');
    metaP.className = 'block-meta';
    metaP.textContent = `Blocked ${timeAgo(block.blockedAt)}`;

    body.append(nameP, metaP);

    const unblockBtn = document.createElement('button');
    unblockBtn.type = 'button';
    unblockBtn.className = 'unblock-btn';
    unblockBtn.textContent = 'Unblock';
    unblockBtn.addEventListener('click', () => {
      showConfirmModal(`Unblock ${block.fullname}? You'll be able to match and chat with each other again.`, () => {
        apiFetch(`/blocks/${block.userId}`, { method: 'DELETE' })
          .then(() => {
            row.remove();
            if (!listEl.children.length) {
              listEl.hidden = true;
              emptyStateEl.hidden = false;
            }
          })
          .catch((error) => {
            if (handleAuthError(error)) return;
            alert(error.message);
          });
      }, { confirmText: 'Unblock' });
    });

    row.append(avatar, body, unblockBtn);
    return row;
  }

  apiFetch('/blocks')
    .then((data) => {
      if (data.blocks.length === 0) {
        listEl.hidden = true;
        emptyStateEl.hidden = false;
        return;
      }
      data.blocks.forEach((b) => listEl.appendChild(buildRow(b)));
    })
    .catch((error) => {
      if (handleAuthError(error)) return;
      listEl.hidden = true;
      document.getElementById('empty-title').textContent = "Couldn't load blocked users";
      document.getElementById('empty-desc').textContent = 'Please try again later.';
      emptyStateEl.hidden = false;
    });

  document.getElementById('back-btn').addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });

});
