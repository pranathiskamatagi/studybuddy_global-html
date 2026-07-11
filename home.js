const userStats = {
  level: 7,
  currentXP: 340,
  targetXP: 500,
  streak: 12
};

document.getElementById('xpLevel').textContent = userStats.level;
document.getElementById('xpTarget').textContent = userStats.targetXP;

const CIRCUMFERENCE = 327;
function setRing(percent) {
  const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;
  document.getElementById('xpRingFill').style.strokeDashoffset = offset;
}

function animateNumber(el, target, duration = 1000) {
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    el.textContent = Math.floor(progress * target);
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = target;
  }
  requestAnimationFrame(tick);
}

animateNumber(document.getElementById('xpCurrent'), userStats.currentXP, 1200);
animateNumber(document.getElementById('streakCount'), userStats.streak, 900);
setTimeout(() => setRing((userStats.currentXP / userStats.targetXP) * 100), 300);