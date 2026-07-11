const searchInput = document.getElementById('subjectSearch');
const grid = document.getElementById('subjectGrid');
const cards = document.querySelectorAll('.subject-card');
const emptyState = document.getElementById('emptyState');
const navItems = document.querySelectorAll('.nav-item');

function animateCount(el, delay) {
  const target = parseInt(el.textContent.match(/\d+/)[0], 10);
  const suffix = el.textContent.replace(/^\d+/, '');
  const duration = 900;

  setTimeout(() => {
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(eased * target) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = target + suffix;
    }
    requestAnimationFrame(tick);
  }, delay);
}

cards.forEach((card, i) => {
  const meta = card.querySelector('.sub-meta');
  if (meta) animateCount(meta, 70 * (i + 1));
});

function createRipple(el, e) {
  const ripple = document.createElement('span');
  ripple.classList.add('ripple');
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  el.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
}

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim().toLowerCase();
  let visibleCount = 0;

  cards.forEach(card => {
    const matches = card.dataset.name.includes(query);
    card.style.display = matches ? 'flex' : 'none';
    if (matches) visibleCount++;
  });

  emptyState.style.display = visibleCount === 0 ? 'flex' : 'none';
  grid.style.display = visibleCount === 0 ? 'none' : 'grid';
});

cards.forEach(card => {
  card.addEventListener('click', (e) => {
    createRipple(card, e);
    cards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    const subject = card.dataset.name;
    // window.location.href = `choose-topic.html?subject=${encodeURIComponent(subject)}`;
    console.log('Selected subject:', subject);
  });
});

navItems.forEach(item => {
  item.addEventListener('click', (e) => createRipple(item, e));
});