document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const listEl = document.getElementById('session-list');
  const filterRowEl = document.getElementById('subject-filter-row');
  const searchInput = document.getElementById('session-search-input');
  let activeSubjectFilter = null; // null = show every subject
  let searchQuery = '';

  // Backend timestamps are UTC but arrive without a timezone marker -
  // same handling as timeAgo() in api.js.
  function parseStart(iso) {
    return new Date(/[Z+-]\d\d:?\d\d$|Z$/.test(iso) ? iso : iso + 'Z');
  }

  function dayLabel(date) {
    const today = new Date();
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOfDay(today) - startOfDay(date)) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function buildRow(s) {
    // A plain div (not <a>) since it now needs a real nested delete
    // button - a <button> can't legally live inside an <a>. role="button"
    // keeps the row itself keyboard/screen-reader accessible the same
    // way a real link would be.
    const row = document.createElement('div');
    row.className = 'session-row';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');

    const top = document.createElement('div');
    top.className = 'session-top';

    const names = document.createElement('p');
    names.className = 'session-names';
    names.textContent = s.participantNames.join(' & ') || 'Unknown';

    const tag = document.createElement('span');
    tag.className = 'session-mode-tag';
    tag.textContent = s.mode;

    top.append(names, tag);

    const topic = document.createElement('p');
    topic.className = 'session-topic';
    topic.textContent = [s.subject, s.topic].filter(Boolean).join(' · ') || 'No topic';

    const bottomRow = document.createElement('div');
    bottomRow.className = 'session-bottom-row';
    const time = document.createElement('p');
    time.className = 'session-time';
    time.textContent = parseStart(s.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) + ' · ' + timeAgo(s.startedAt) + (s.endedAt ? ' · ended' : ' · ongoing');

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'session-delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      showConfirmModal('Permanently delete this conversation? This cannot be undone.', () => {
        apiFetch(`/admin/sessions/${s.id}`, { method: 'DELETE' })
          .then(load)
          .catch((error) => {
            if (handleAuthError(error)) return;
            alert(error.message);
          });
      }, { confirmText: 'Delete', danger: true });
    });

    bottomRow.append(time, deleteBtn);

    const openView = () => {
      window.location.href = `admin-chat-view.html?sessionId=${s.id}&mode=${s.mode}`;
    };
    row.addEventListener('click', openView);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') openView();
    });

    row.append(top, topic, bottomRow);
    return row;
  }

  let allSessions = [];

  function renderFilterRow(subjects) {
    filterRowEl.innerHTML = '';
    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = 'subject-chip' + (activeSubjectFilter === null ? ' active' : '');
    allChip.textContent = 'All';
    allChip.addEventListener('click', () => {
      activeSubjectFilter = null;
      renderList();
    });
    filterRowEl.appendChild(allChip);

    subjects.forEach((subject) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'subject-chip' + (activeSubjectFilter === subject ? ' active' : '');
      chip.textContent = subject;
      chip.addEventListener('click', () => {
        activeSubjectFilter = subject;
        renderList();
      });
      filterRowEl.appendChild(chip);
    });
  }

  function renderList() {
    listEl.innerHTML = '';

    // A free-text search over subject/topic, applied before grouping so
    // the subject chips themselves only ever show subjects that actually
    // have a match - typing "algebra" narrows straight down to it instead
    // of leaving every other subject's chip clickable but empty.
    const query = searchQuery.trim().toLowerCase();
    const visibleSessions = query
      ? allSessions.filter((s) =>
          (s.subject || '').toLowerCase().includes(query) ||
          (s.topic || '').toLowerCase().includes(query))
      : allSessions;

    // Subject chips still narrow the list, but the list itself is a real
    // timeline: newest first, split under a heading per day.
    const subjects = Array.from(new Set(visibleSessions.map((s) => s.subject || 'No subject')))
      .sort((a, b) => a.localeCompare(b));
    renderFilterRow(subjects);

    const shown = visibleSessions
      .filter((s) => activeSubjectFilter === null || (s.subject || 'No subject') === activeSubjectFilter)
      .sort((a, b) => parseStart(b.startedAt) - parseStart(a.startedAt));

    let currentLabel = null;
    let currentGroup = null;
    shown.forEach((s) => {
      const label = dayLabel(parseStart(s.startedAt));
      if (label !== currentLabel) {
        currentLabel = label;
        const heading = document.createElement('p');
        heading.className = 'subject-group-heading';
        heading.textContent = label;
        listEl.appendChild(heading);
        currentGroup = document.createElement('div');
        currentGroup.className = 'subject-group';
        listEl.appendChild(currentGroup);
      }
      currentGroup.appendChild(buildRow(s));
    });
  }

  function load() {
    apiFetch('/admin/sessions')
      .then((data) => {
        allSessions = data.sessions;
        renderList();
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        listEl.textContent = "Couldn't load conversations: " + error.message;
      });
  }

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderList();
  });

  load();

});
