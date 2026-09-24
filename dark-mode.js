// Real dark mode - not just a toggle that shows an alert(). Saved as a
// plain localStorage flag (same pattern as sound.js's soundEnabled()),
// applied as a single class on <body> that dark-mode.css's rules key off
// of. Call applyDarkMode() as early as possible on any page that loads
// dark-mode.css, so the page never "flashes" light before switching.

const DARK_MODE_KEY = 'studybuddy_dark_mode';

function isDarkModeEnabled() {
  return localStorage.getItem(DARK_MODE_KEY) === '1';
}

function setDarkModeEnabled(enabled) {
  localStorage.setItem(DARK_MODE_KEY, enabled ? '1' : '0');
  applyDarkMode();
}

function applyDarkMode() {
  document.body.classList.toggle('dark-mode', isDarkModeEnabled());
}

document.addEventListener('DOMContentLoaded', applyDarkMode);
