// Shared helpers for talking to the Flask backend - included by any page
// that needs to call the API, so this logic only lives in one place.

// Auto-detects which backend to talk to, so this never needs manually
// flipping back and forth between setups:
//   - localhost/127.0.0.1/a 192.168.x LAN address (Live Server, this
//     project's own preview server) - the frontend and backend run as two
//     separate local processes, backend always on port 5000.
//   - anywhere else (the real hosted site) - the site and the API share
//     one address, so requests go straight to it.
const IS_LOCAL_SPLIT = ['localhost', '127.0.0.1'].includes(location.hostname) || location.hostname.startsWith('192.168.');
const IS_SAME_ORIGIN_SERVER = location.port === '5000';
// Anywhere that isn't the local two-server setup, the site and the API are
// served from the SAME address (the hosted setup - see backend/app/__init__.py,
// where Flask serves the pages too), so requests just go to that address.
const BACKEND_ORIGIN = IS_LOCAL_SPLIT && !IS_SAME_ORIGIN_SERVER
  ? `http://${location.hostname}:5000`
  : location.origin;
const API_BASE = BACKEND_ORIGIN + '/api';
// Same backend, but Socket.IO connects to the plain origin (no /api) -
// it isn't a normal HTTP route, it upgrades the connection itself.
const SOCKET_BASE = BACKEND_ORIGIN;
const TOKEN_KEY = 'studybuddy_token';
const USER_KEY = 'studybuddy_user';

// Forces every page that loads api.js out of the browser's back-forward
// cache (bfcache). Without this, hitting the browser's Back/Forward
// buttons can restore a FROZEN snapshot of an old page exactly as it
// was - real-time data (who's online, a partner's name in the URL,
// today's matching rules) can look wrong even though the CURRENT code
// is correct, because nothing actually re-ran. An `unload` listener -
// even an empty one - is a well-known, deliberate way to make Chromium
// browsers (Edge included) skip bfcache and do a real fresh reload
// instead every time.
window.addEventListener('unload', () => {});

// A random id this browser keeps for itself - sent at login so the server
// can tell "same device as before" from "a new device" and warn the
// account owner about the latter. Not personal information.
function getDeviceId() {
  try {
    let id = localStorage.getItem('studybuddy_device_id');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(16) + Math.random().toString(16).slice(2));
      localStorage.setItem('studybuddy_device_id', id);
    }
    return id;
  } catch (e) {
    return '';
  }
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// Wraps fetch() so every call automatically: points at the backend,
// sends JSON, and attaches the login token if we have one. Throws a
// plain Error with the backend's message on failure, so callers can
// just try/catch instead of checking response.ok every time.
async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(API_BASE + path, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    // Lets callers tell "you're not logged in (any more)" apart from
    // other failures (e.g. a validation error) without parsing text.
    error.status = response.status;
    throw error;
  }
  return data;
}

// A page whose whole purpose requires being logged in (e.g. Home) should
// call this first - sends someone with no token straight to Login instead
// of showing a broken, data-less screen.
function requireLogin() {
  if (!getToken()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// Turns a backend timestamp into "5 min ago" style text - the backend
// always stores UTC, but SQLite silently drops the timezone marker when
// it reads a timestamp back out, so the string here can look like
// "2026-08-25T13:57:50" with no "+00:00"/"Z" suffix. Without one,
// new Date() assumes LOCAL time instead of UTC, which silently shifts
// every timestamp by your timezone offset - append "Z" ourselves so it's
// parsed as the UTC time it actually is.
function timeAgo(isoString) {
  const utcString = /[Z+-]\d\d:?\d\d$|Z$/.test(isoString) ? isoString : isoString + 'Z';
  const seconds = Math.floor((Date.now() - new Date(utcString).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// Call this from a catch block when an apiFetch call fails and you want
// "the login expired" handled the SAME way everywhere: clear the stale
// session and send the person to log back in, instead of letting the
// page carry on silently as if everything still worked. Returns true if
// it handled the error (so the caller can skip its own normal handling).
function handleAuthError(error) {
  if (error.status === 401) {
    clearSession();
    alert('Your session has expired - please log in again.');
    window.location.href = 'login.html';
    return true;
  }
  return false;
}

// Shared by home.js/notifications.js/connecting.js/match-found.js's
// 'session_started' socket listener (see sessions.py's emit) - the
// instant someone ELSE starts a real 1-on-1 session with this person,
// this drops them straight into the chat instead of waiting for them to
// notice a notification and click it themselves. Same avatar-color rule
// used everywhere a real user id needs a consistent color.
const AVATAR_COLORS = ['blue', 'green', 'pink', 'orange'];
function openStartedSession(data) {
  const sessionParams = new URLSearchParams({
    partner: data.partnerName,
    color: AVATAR_COLORS[data.partnerId % AVATAR_COLORS.length],
    topic: data.topic || '',
    subject: data.subject || '',
    level: data.level || '',
    country: data.partnerCountry || '',
    flag: '',
    mode: data.mode,
    partnerId: data.partnerId,
    // The REAL session the other person just created - lets session.js
    // join it directly instead of creating a second, disconnected one.
    sessionId: data.sessionId,
  });
  window.location.href = 'session.html?' + sessionParams.toString();
}

// Only someone who is ACTIVELY searching (on the matching screens) has
// agreed to be dropped into a chat the instant a partner is found.
// Anyone else - on Home, in a quiz, on their profile - just gets a
// "Join / Not now" popup, instead of being yanked out of whatever they
// were doing into a chat they never asked for.
const AUTO_JOIN_PAGES = ['connecting.html', 'match-found.html'];
function goToStartedSession(data) {
  const page = window.location.pathname.split('/').pop();
  if (AUTO_JOIN_PAGES.includes(page)) {
    openStartedSession(data);
    return;
  }
  showSessionInvitePrompt(data);
}

// Several listeners on one page can all fire for the same push - only
// one popup per session.
let _promptedSessionId = null;
function showSessionInvitePrompt(data) {
  if (_promptedSessionId === data.sessionId) return;
  _promptedSessionId = data.sessionId;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(20,28,60,0.45);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;font-family:Poppins,sans-serif;';
  const card = document.createElement('div');
  card.style.cssText = 'background:#fff;border-radius:22px;padding:26px 22px;max-width:340px;width:100%;text-align:center;box-shadow:0 20px 50px rgba(20,28,60,0.25);';
  const title = document.createElement('p');
  title.style.cssText = 'margin:0 0 6px;font-size:17px;font-weight:700;color:#1b2340;';
  title.textContent = `${data.partnerName} wants to study with you`;
  const sub = document.createElement('p');
  sub.style.cssText = 'margin:0 0 18px;font-size:14px;color:#6b7699;';
  sub.textContent = data.topic || data.subject || 'A study session';
  const joinBtn = document.createElement('button');
  joinBtn.type = 'button';
  joinBtn.textContent = 'Join now';
  joinBtn.style.cssText = 'width:100%;padding:13px;border:none;border-radius:999px;background:linear-gradient(90deg,#3f6fe0,#34c77b);color:#fff;font:700 15px Poppins,sans-serif;cursor:pointer;';
  const laterBtn = document.createElement('button');
  laterBtn.type = 'button';
  laterBtn.textContent = 'Not now';
  laterBtn.style.cssText = 'width:100%;margin-top:8px;padding:11px;border:none;background:none;color:#6b7699;font:600 14px Poppins,sans-serif;cursor:pointer;';
  joinBtn.addEventListener('click', () => openStartedSession(data));
  laterBtn.addEventListener('click', () => overlay.remove());
  card.append(title, sub, joinBtn, laterBtn);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

// Universal live auto-redirect: previously only wired into 5 specific
// pages (Home, Notifications, Connect, and the two matching screens) -
// which meant the redirect silently failed to happen at all whenever
// the OTHER person was on any OTHER screen (Profile, Achievements, a
// quiz, Settings...) at the exact moment someone started a session with
// them. Since api.js loads almost everywhere, this single connection
// here covers every page that also loads socket.io.min.js, with no
// per-page wiring needed - true "no need for both people's acceptance,"
// no matter where either of them currently is in the app. Pages that
// already open their own dedicated socket (session.js, home.js, etc.)
// just get this as a harmless second connection alongside it.
//
// Waits for the window to fully load (rather than checking for `io`
// right here) because script tags run in the order they appear in the
// HTML - on several pages api.js is listed BEFORE socket.io.min.js, so
// `io` wouldn't exist yet if this ran immediately. By 'load', every
// script on the page has already run regardless of order.
window.addEventListener('load', () => {
  if (typeof io !== 'function' || !getToken()) return;
  const _globalPresenceSocket = io(SOCKET_BASE, { auth: { token: getToken() } });
  _globalPresenceSocket.on('session_started', (data) => {
    goToStartedSession(data);
  });
});
