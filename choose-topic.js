const searchInput = document.getElementById('topicSearch');
const list = document.getElementById('topicList');
const topics = document.querySelectorAll('.topic-card');
const emptyState = document.getElementById('emptyState');
const subjectLabel = document.getElementById('subjectLabel');
const actionHint = document.getElementById('actionHint');
const learnBtn = document.getElementById('learnBtn');
const teachBtn = document.getElementById('teachBtn');

let selectedTopic = null;

// ===== READ SUBJECT FROM URL (?subject=mathematics) =====
const params = new URLSearchParams(window.location.search);
const subject = params.get('subject');
if (subject) {
  subjectLabel.textContent = subject.charAt(0).toUpperCase() + subject.slice(1);
}

// ===== FILL PROGRESS BARS ON LOAD (staggered) =====
topics.forEach((card, i) => {
  const fill = card.querySelector('.progress-fill');
  setTimeout(() => fill.classList.add('filled'), 300 + i * 60);
});

// ===== RIPPLE HELPER =====
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

// ===== SEARCH FILTER =====
searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim().toLowerCase();
  let visibleCount = 0;

  topics.forEach(card => {
    const matches = card.dataset.name.includes(query);
    card.style.display = matches ? 'flex' : 'none';
    if (matches) visibleCount++;
  });

  emptyState.style.display = visibleCount === 0 ? 'flex' : 'none';
  list.style.display = visibleCount === 0 ? 'none' : 'flex';
});

// ===== TOPIC SELECTION =====
topics.forEach(card => {
  card.addEventListener('click', (e) => {
    createRipple(card, e);
    topics.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    selectedTopic = card.dataset.name;
    actionHint.textContent = `Ready to explore "${card.querySelector('h3').textContent}"`;
    actionHint.classList.add('ready');

    learnBtn.disabled = false;
    teachBtn.disabled = false;
  });
});

// ===== ACTION BUTTONS =====
learnBtn.addEventListener('click', () => {
  if (!selectedTopic) return;
  // Later: window.location.href = `find-teacher.html?topic=${encodeURIComponent(selectedTopic)}`;
  console.log('Learn mode selected for:', selectedTopic);
});

teachBtn.addEventListener('click', () => {
  if (!selectedTopic) return;
  // Later: window.location.href = `learn-topic.html?topic=${encodeURIComponent(selectedTopic)}`;
  console.log('Teach mode selected for:', selectedTopic);
});
// =====================================================
// DISTRACTION WATCHER
// Detects tab-switching / long inactivity during a chat
// and shows a gentle non-blocking nudge.
// Drop this script into any chat/session page.
// =====================================================

(function () {
  const IDLE_LIMIT_MS = 45000;      // no mouse/keyboard activity for 45s
  const TAB_AWAY_LIMIT_MS = 8000;   // tab hidden for 8s+

  let idleTimer = null;
  let tabHiddenAt = null;

  // ----- Build the nudge banner once -----
  const banner = document.createElement('div');
  banner.id = 'distraction-banner';
  banner.innerHTML = `
    <i class="fa-solid fa-face-meh"></i>
    <span id="distraction-message">Still there? Your study buddy is waiting 👀</span>
    <button id="distraction-dismiss"><i class="fa-solid fa-xmark"></i></button>
  `;
  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(banner);
    document.getElementById('distraction-dismiss').addEventListener('click', hideBanner);
  });

  function showBanner(message) {
    document.getElementById('distraction-message').textContent = message;
    banner.classList.add('show');
  }

  function hideBanner() {
    banner.classList.remove('show');
  }

  // ----- Idle detection -----
  function resetIdleTimer() {
    hideBanner();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      showBanner("You've been quiet for a bit — everything okay? 🙂");
    }, IDLE_LIMIT_MS);
  }

  ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(evt =>
    window.addEventListener(evt, resetIdleTimer, { passive: true })
  );

  // ----- Tab visibility detection -----
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      tabHiddenAt = Date.now();
    } else if (tabHiddenAt) {
      const awayFor = Date.now() - tabHiddenAt;
      if (awayFor >= TAB_AWAY_LIMIT_MS) {
        showBanner("Welcome back! You switched tabs for a bit — let's pick up where we left off 📖");
      }
      tabHiddenAt = null;
    }
  });

  resetIdleTimer();
})();