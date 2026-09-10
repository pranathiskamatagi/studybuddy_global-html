// A reusable "reward earned" celebration popup - same lazy-build-once
// pattern as confirm-modal.js, so any page can just call
// showPointsPopup("+100 points") and not worry about building the DOM.
//
// Unlike confirm-modal.js, this ISN'T a decision the person has to act
// on - it auto-dismisses on its own after a moment, so it never blocks
// anything (you can keep chatting/clicking right through it).

function showPointsPopup(rewardText, options = {}) {
  const icon = options.icon || '🎉';
  const sub = options.sub || '';

  let overlay = document.getElementById('points-popup-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'points-popup-overlay';
    overlay.id = 'points-popup-overlay';
    overlay.innerHTML = `
      <div class="points-popup-card">
        <div class="points-popup-icon" id="points-popup-icon"></div>
        <p class="points-popup-text" id="points-popup-text"></p>
        <p class="points-popup-sub" id="points-popup-sub"></p>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  document.getElementById('points-popup-icon').textContent = icon;
  document.getElementById('points-popup-text').textContent = rewardText;
  const subEl = document.getElementById('points-popup-sub');
  subEl.textContent = sub;
  subEl.hidden = !sub;

  // Restarting the bounce animation if this gets called again quickly -
  // removing and re-adding the class is what makes a CSS animation
  // replay instead of silently no-op-ing the second time.
  const iconEl = document.getElementById('points-popup-icon');
  iconEl.style.animation = 'none';
  void iconEl.offsetWidth; // forces the browser to acknowledge the reset before...
  iconEl.style.animation = '';

  overlay.classList.add('visible');
  _burstConfetti(iconEl);
  // sound.js is optional (only pages that include it get real sound) -
  // guarded so this never breaks a page that doesn't load it.
  if (typeof playPointsSound === 'function') playPointsSound();

  clearTimeout(overlay._dismissTimer);
  overlay._dismissTimer = setTimeout(() => {
    overlay.classList.remove('visible');
  }, 1800);
}

// A small burst of colored pieces flying out from the popup's icon -
// pure CSS animation, each piece gets a random direction/rotation via
// inline CSS custom properties set here in JS.
const CONFETTI_COLORS = ['#3f6fe0', '#34c77b', '#f5a623', '#ec4899', '#a78bfa'];
function _burstConfetti(originEl) {
  const rect = originEl.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  const container = document.createElement('div');
  container.className = 'confetti-burst';

  for (let i = 0; i < 22; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const angle = Math.random() * Math.PI * 2;
    const distance = 55 + Math.random() * 75;
    piece.style.left = originX + 'px';
    piece.style.top = originY + 'px';
    piece.style.setProperty('--tx', (Math.cos(angle) * distance) + 'px');
    piece.style.setProperty('--ty', (Math.sin(angle) * distance) + 'px');
    piece.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    container.appendChild(piece);
  }

  document.body.appendChild(container);
  setTimeout(() => container.remove(), 1000);
}
