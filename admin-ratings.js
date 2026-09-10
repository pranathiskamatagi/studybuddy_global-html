document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const listEl = document.getElementById('rating-list');

  function buildRow(r) {
    const row = document.createElement('div');
    row.className = 'rating-row';

    const top = document.createElement('div');
    top.className = 'rating-top';

    const left = document.createElement('div');
    const names = document.createElement('p');
    names.className = 'rating-names';
    names.textContent = `${r.raterName} → ${r.rateeName || 'Unknown'}`;
    const stars = document.createElement('p');
    stars.className = 'rating-stars';
    stars.textContent = '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars);
    left.append(names, stars);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'remove-rating-btn';
    btn.textContent = 'Remove';
    btn.addEventListener('click', () => {
      showConfirmModal('Remove this rating? This cannot be undone.', () => {
        apiFetch(`/admin/ratings/${r.id}`, { method: 'DELETE' })
          .then(load)
          .catch((error) => {
            if (handleAuthError(error)) return;
            alert(error.message);
          });
      }, { confirmText: 'Remove', danger: true });
    });

    top.append(left, btn);
    row.appendChild(top);

    if (r.badgeText) {
      const badge = document.createElement('p');
      badge.className = 'rating-badge';
      badge.textContent = r.badgeText;
      row.appendChild(badge);
    }
    if (r.comment) {
      const comment = document.createElement('p');
      comment.className = 'rating-comment';
      comment.textContent = `"${r.comment}"`;
      row.appendChild(comment);
    }

    const time = document.createElement('p');
    time.className = 'rating-time';
    time.textContent = timeAgo(r.createdAt);
    row.appendChild(time);

    return row;
  }

  function load() {
    apiFetch('/admin/ratings')
      .then((data) => {
        listEl.innerHTML = '';
        if (data.ratings.length === 0) {
          const note = document.createElement('p');
          note.className = 'empty-note';
          note.textContent = 'No ratings yet.';
          listEl.appendChild(note);
          return;
        }
        data.ratings.forEach((r) => listEl.appendChild(buildRow(r)));
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        listEl.textContent = "Couldn't load ratings: " + error.message;
      });
  }

  load();

});
