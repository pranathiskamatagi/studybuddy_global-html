// A dev-only tool for testing real-time chat solo, without needing a
// second real browser window. Deliberately does NOT use api.js/its
// localStorage keys - this page's login is kept completely separate so
// it can never overwrite your real logged-in session in another tab.

const API_BASE = 'http://127.0.0.1:5000/api';
const SOCKET_BASE = 'http://127.0.0.1:5000';

document.addEventListener('DOMContentLoaded', () => {

  const statusEl = document.getElementById('status');
  const chatSection = document.getElementById('chat-section');
  const logEl = document.getElementById('log');
  const connectBtn = document.getElementById('connect-btn');

  let socket = null;
  let myName = '';

  function log(text) {
    const p = document.createElement('p');
    p.textContent = text;
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  }

  connectBtn.addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const sessionId = document.getElementById('session-id').value.trim();

    if (!email || !password || !sessionId) {
      statusEl.textContent = 'Fill in all three fields first.';
      statusEl.style.color = '#e0503f';
      return;
    }

    connectBtn.disabled = true;
    statusEl.textContent = 'Logging in...';
    statusEl.style.color = '#667';

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed.');

      myName = data.user.fullname;

      socket = io(SOCKET_BASE, { auth: { token: data.token } });

      socket.on('connect', () => {
        statusEl.textContent = `Connected as ${myName}. Joining session #${sessionId}...`;
        statusEl.style.color = '#2fbf83';
        socket.emit('join', { session_id: Number(sessionId) });
        chatSection.style.display = 'block';
      });

      socket.on('new_message', (message) => {
        log(`${message.senderName}: ${message.text}`);
      });

      // Lets this dev tool surface distraction nudges too (see
      // app/distraction.py) - real session.html/group-chat.html already
      // listen for this; this tool didn't, which made it invisible here.
      socket.on('distraction_nudge', (data) => {
        log(`[distraction nudge] ${data.message}`);
      });

      socket.on('disconnect', () => {
        statusEl.textContent = `Disconnected as ${myName} - the other side just saw "${myName} left."`;
        statusEl.style.color = '#e0503f';
      });
    } catch (error) {
      statusEl.textContent = error.message;
      statusEl.style.color = '#e0503f';
      connectBtn.disabled = false;
    }
  });

  document.getElementById('send-btn').addEventListener('click', () => {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    const sessionId = document.getElementById('session-id').value.trim();
    if (!text || !socket) return;
    socket.emit('send_message', { session_id: Number(sessionId), text });
    input.value = '';
  });

  document.getElementById('leave-btn').addEventListener('click', () => {
    if (socket) socket.disconnect();
  });

});
