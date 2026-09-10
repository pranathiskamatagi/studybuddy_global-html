// Short sound effects, entirely synthesized with the Web Audio API - no
// audio files to download or go stale. Gated by the real "Sound effects"
// toggle in Settings (was previously just a dead switch that did
// nothing when flipped).
const SOUND_PREF_KEY = 'studybuddy_sound_enabled';

function soundEnabled() {
  const stored = localStorage.getItem(SOUND_PREF_KEY);
  return stored === null ? true : stored === 'true'; // on by default, same as the checkbox's default "checked"
}

function setSoundEnabled(enabled) {
  localStorage.setItem(SOUND_PREF_KEY, String(enabled));
}

// Lazily created - browsers won't let a page make sound before the
// person has interacted with it at least once, so creating this at
// script-load time would just throw.
let _audioCtx = null;
function _getAudioContext() {
  if (!_audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    _audioCtx = new AudioContextClass();
  }
  return _audioCtx;
}

function _playTone(frequency, duration, volume = 0.15) {
  if (!soundEnabled()) return;
  try {
    const ctx = _getAudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    // A quick exponential fade-out (rather than an abrupt stop) is what
    // makes a synthesized tone sound like a soft "blip" instead of a
    // harsh click.
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  } catch (error) {
    // Autoplay restrictions or an unsupported browser shouldn't break
    // anything else on the page - sound is a nice-to-have, never required.
    console.warn('Could not play sound:', error.message);
  }
}

function playMessageSound() {
  _playTone(700, 0.12, 0.1);
}

function playPointsSound() {
  // A quick rising two-note "cha-ching".
  _playTone(660, 0.1);
  setTimeout(() => _playTone(990, 0.18), 90);
}

function playMatchSound() {
  // A short rising three-note chime (C5 - E5 - G5).
  _playTone(523, 0.12);
  setTimeout(() => _playTone(659, 0.12), 110);
  setTimeout(() => _playTone(784, 0.22), 220);
}
