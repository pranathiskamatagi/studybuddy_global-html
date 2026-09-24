document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const listEl = document.getElementById('teacher-list');
  const emptyStateEl = document.getElementById('empty-state');
  const searchInput = document.getElementById('subject-search');
  let debounceTimer = null;

  function initials(fullname) {
    return (fullname || '?').trim().charAt(0).toUpperCase();
  }

  function buildRow(person) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'teacher-row';

    const avatar = document.createElement('div');
    avatar.className = 'teacher-avatar';
    if (person.photo) {
      const img = document.createElement('img');
      img.src = person.photo;
      img.alt = '';
      avatar.appendChild(img);
    } else {
      avatar.textContent = initials(person.fullname);
    }

    const body = document.createElement('div');
    body.className = 'teacher-body';

    const nameP = document.createElement('p');
    nameP.className = 'teacher-name';
    nameP.textContent = person.country ? `${person.fullname}, ${person.country}` : person.fullname;

    const chipRow = document.createElement('div');
    chipRow.className = 'teacher-chip-row';
    (person.teachesSubjects || []).forEach((subject) => {
      const chip = document.createElement('span');
      chip.className = 'teacher-chip';
      chip.textContent = subject;
      chipRow.appendChild(chip);
    });

    body.append(nameP, chipRow);
    row.append(avatar, body);
    row.addEventListener('click', () => showProfileView(person.id));
    return row;
  }

  function render(users) {
    listEl.innerHTML = '';
    if (users.length === 0) {
      listEl.hidden = true;
      emptyStateEl.hidden = false;
      return;
    }
    listEl.hidden = false;
    emptyStateEl.hidden = true;
    users.forEach((u) => listEl.appendChild(buildRow(u)));
  }

  function load(subject) {
    const query = subject ? `?subject=${encodeURIComponent(subject)}` : '';
    apiFetch(`/users/teaching${query}`)
      .then((data) => render(data.users))
      .catch((error) => {
        if (handleAuthError(error)) return;
        render([]);
      });
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => load(searchInput.value.trim()), 250);
  });

  document.getElementById('back-btn').addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });

  load('');

});
