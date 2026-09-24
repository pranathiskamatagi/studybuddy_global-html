document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('sessionId');

  if (!sessionId) {
    window.location.href = 'admin-sessions.html';
    return;
  }

  const messagesEl = document.getElementById('chat-messages');
  const messageBubbles = new Map();

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function formatTime(isoString) {
    const utcString = /[Z+-]\d\d:?\d\d$|Z$/.test(isoString) ? isoString : isoString + 'Z';
    return new Date(utcString).toLocaleString();
  }

  function addMessage(m) {
    const bubble = document.createElement('div');
    bubble.className = 'msg' + (m.isAdminMessage ? ' msg-admin' : '');
    if (m.id) messageBubbles.set(m.id, bubble);

    const senderP = document.createElement('p');
    senderP.className = 'msg-sender';
    senderP.textContent = m.isAdminMessage ? '⚠️ Admin (you)' : m.senderName;
    bubble.appendChild(senderP);

    if (m.deleted) {
      const p = document.createElement('p');
      p.className = 'msg-deleted-text';
      p.textContent = 'This message was deleted';
      bubble.appendChild(p);
    } else {
      if (m.imageData) {
        bubble.classList.add('msg-image');
        const img = document.createElement('img');
        img.src = m.imageData;
        img.alt = 'Shared image';
        bubble.appendChild(img);
      }
      if (m.text) {
        const p = document.createElement('p');
        p.textContent = m.text;
        bubble.appendChild(p);
      }
    }

    const timeP = document.createElement('p');
    timeP.className = 'msg-time';
    timeP.textContent = formatTime(m.createdAt);
    bubble.appendChild(timeP);

    if (!m.deleted && m.id) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'admin-msg-delete-btn';
      deleteBtn.textContent = 'Remove';
      deleteBtn.addEventListener('click', () => {
        apiFetch(`/admin/messages/${m.id}/delete`, { method: 'POST' })
          .catch((error) => alert("Couldn't remove that message: " + error.message));
      });
      bubble.appendChild(deleteBtn);
    }

    messagesEl.appendChild(bubble);
    scrollToBottom();
  }

  // The "snapshot" half - real history, loaded once on open.
  apiFetch(`/admin/sessions/${sessionId}/messages`)
    .then((data) => {
      if (data.messages.length === 0) {
        const note = document.createElement('p');
        note.className = 'empty-note';
        note.textContent = 'No messages in this conversation yet.';
        messagesEl.appendChild(note);
        return;
      }
      data.messages.forEach(addMessage);
    })
    .catch((error) => {
      if (handleAuthError(error)) return;
      messagesEl.textContent = "Couldn't load this conversation: " + error.message;
    });

  // The "live" half - a silent watch, see sockets.py's 'admin_watch' for
  // exactly why this leaves no trace for the two real people chatting.
  const socket = io(SOCKET_BASE, { auth: { token: getToken() } });
  socket.on('connect', () => {
    socket.emit('admin_watch', { session_id: Number(sessionId) });
  });
  socket.on('new_message', (message) => {
    if (message.sessionId !== Number(sessionId)) return;
    messagesEl.querySelector('.empty-note')?.remove();
    addMessage(message);
  });
  socket.on('message_deleted', (data) => {
    const bubble = messageBubbles.get(data.messageId);
    if (!bubble) return;
    bubble.querySelectorAll('.msg-image, img, p:not(.msg-sender):not(.msg-time)').forEach((el) => el.remove());
    const p = document.createElement('p');
    p.className = 'msg-deleted-text';
    p.textContent = 'This message was deleted';
    bubble.insertBefore(p, bubble.querySelector('.msg-time'));
  });

  // ---------------------------------------------------------------
  // Send a real, visible warning into the live chat
  // ---------------------------------------------------------------
  document.getElementById('warn-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('warn-input');
    const message = input.value.trim();
    if (!message) return;

    apiFetch(`/admin/sessions/${sessionId}/warn`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
      .then(() => { input.value = ''; })
      .catch((error) => alert("Couldn't send that: " + error.message));
  });

  // ---------------------------------------------------------------
  // Force-end this session right now
  // ---------------------------------------------------------------
  const cancelBtn = document.getElementById('cancel-session-btn');
  cancelBtn.hidden = false;
  cancelBtn.addEventListener('click', () => {
    showConfirmModal('End this session right now? Both people will be notified and sent back to Home.', () => {
      apiFetch(`/admin/sessions/${sessionId}/cancel`, { method: 'POST' })
        .then(() => alert('Session cancelled.'))
        .catch((error) => alert(error.message));
    }, { confirmText: 'Cancel session', danger: true });
  });

});
