document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const listEl = document.getElementById('rating-list');

  function buildEditForm(r, commentP) {
    const form = document.createElement('div');
    form.className = 'edit-rating-form';
    form.hidden = true;

    const starsInput = document.createElement('input');
    starsInput.type = 'number';
    starsInput.min = '1';
    starsInput.max = '5';
    starsInput.value = r.stars;

    const badgeInput = document.createElement('input');
    badgeInput.type = 'text';
    badgeInput.placeholder = 'Badge text (blank = hides the badge)';
    badgeInput.value = r.badgeText || '';

    const commentInput = document.createElement('textarea');
    commentInput.placeholder = 'Comment';
    commentInput.value = r.comment || '';
    commentInput.rows = 2;

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      const stars = Math.min(5, Math.max(1, Number(starsInput.value) || r.stars));
      const comment = commentInput.value.trim();
      const badge_text = badgeInput.value.trim();
      apiFetch(`/admin/ratings/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stars, comment, badge_text }),
      })
        .then(load)
        .catch((error) => {
          if (handleAuthError(error)) return;
          alert(error.message);
        });
    });

    form.append(starsInput, badgeInput, commentInput, saveBtn);
    return form;
  }

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

    const actions = document.createElement('div');
    actions.className = 'rating-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'edit-rating-btn';
    editBtn.textContent = 'Edit';

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

    actions.append(editBtn, btn);
    top.append(left, actions);
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

    const editForm = buildEditForm(r);
    row.appendChild(editForm);
    editBtn.addEventListener('click', () => {
      editForm.hidden = !editForm.hidden;
    });

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
