// A real play/pause + progress bar for a voice message bubble, replacing
// the browser's own <audio controls> (which looks wildly different across
// browsers and never matches the rest of the chat UI - see session.js/
// group-chat.js's addMessage, both of which call this instead). Shared by
// session.js and group-chat.js since a voice message looks identical in
// both a 1-on-1 and a group chat.

// Only one voice note plays at a time, same as WhatsApp - starting a new
// one pauses whatever was already playing, tracked across every bubble on
// the page (module-level, not per-bubble).
let _currentlyPlayingAudio = null;

function formatAudioTime(totalSeconds) {
  if (!isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function buildAudioPlayerBubble(audioData) {
  const wrap = document.createElement('div');
  wrap.className = 'audio-player';

  const audio = new Audio(audioData);
  audio.preload = 'metadata';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'audio-play-btn';
  playBtn.setAttribute('aria-label', 'Play voice message');
  const playIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>';
  const pauseIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"></path></svg>';
  playBtn.innerHTML = playIcon;

  const track = document.createElement('div');
  track.className = 'audio-track';
  const trackFill = document.createElement('div');
  trackFill.className = 'audio-track-fill';
  track.appendChild(trackFill);

  const timeLabel = document.createElement('span');
  timeLabel.className = 'audio-time';
  timeLabel.textContent = '0:00';

  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      if (_currentlyPlayingAudio && _currentlyPlayingAudio !== audio) {
        _currentlyPlayingAudio.pause();
      }
      audio.play();
      _currentlyPlayingAudio = audio;
    } else {
      audio.pause();
    }
  });

  audio.addEventListener('play', () => { playBtn.innerHTML = pauseIcon; });
  audio.addEventListener('pause', () => { playBtn.innerHTML = playIcon; });
  audio.addEventListener('loadedmetadata', () => {
    timeLabel.textContent = formatAudioTime(audio.duration);
  });
  audio.addEventListener('timeupdate', () => {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    trackFill.style.width = pct + '%';
    timeLabel.textContent = formatAudioTime(audio.currentTime);
  });
  audio.addEventListener('ended', () => {
    trackFill.style.width = '0%';
    timeLabel.textContent = formatAudioTime(audio.duration);
    if (_currentlyPlayingAudio === audio) _currentlyPlayingAudio = null;
  });

  // Clicking anywhere on the track jumps playback to that point - only
  // once real duration metadata has actually loaded.
  track.addEventListener('click', (event) => {
    if (!audio.duration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  });

  wrap.append(playBtn, track, timeLabel);
  return wrap;
}
