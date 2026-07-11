// ===== ELEMENTS =====
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const rematchBanner = document.getElementById('rematchBanner');
const rematchText = document.getElementById('rematchText');
const statusText = document.getElementById('statusText');
const personName = document.getElementById('personName');

// ===== SEND MESSAGE =====
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  const bubble = document.createElement('div');
  bubble.classList.add('message-bubble', 'sent');
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  bubble.innerHTML = `<p></p><span class="msg-time">${time}</span>`;
  bubble.querySelector('p').textContent = text;

  chatMessages.insertBefore(bubble, typingIndicator);
  messageInput.value = '';
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Simulate the other person typing + replying (placeholder for real backend/socket)
  simulateReply();
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// ===== SIMULATED TYPING + REPLY (placeholder until Socket.IO is wired in) =====
function simulateReply() {
  typingIndicator.classList.add('show');
  chatMessages.scrollTop = chatMessages.scrollHeight;

  setTimeout(() => {
    typingIndicator.classList.remove('show');

    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble', 'received');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bubble.innerHTML = `<p>Got it, let's break that down step by step 👍</p><span class="msg-time">${time}</span>`;

    chatMessages.insertBefore(bubble, typingIndicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 1600);
}

// ===== SIMULATE PARTNER LEAVING + REMATCH (placeholder for real backend event) =====
// In production, this fires from a WebSocket "partner_left" event instead of a timer.
function simulatePartnerLeft() {
  statusText.textContent = 'Disconnected';
  document.querySelector('.status-dot').classList.remove('online');

  rematchText.textContent = `${personName.textContent} left the session — finding you a new match...`;
  rematchBanner.classList.add('show');

  setTimeout(() => {
    rematchBanner.classList.remove('show');
    personName.textContent = 'Rohan Verma';
    statusText.textContent = 'Online · Teaching Algebra';
    document.querySelector('.status-dot').classList.add('online');
    document.querySelector('.person-avatar').src = 'https://i.pravatar.cc/100?img=15';

    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble', 'received');
    bubble.innerHTML = `<p>Hey! I heard you needed help with algebra — happy to continue where you left off 🙂</p><span class="msg-time">Just now</span>`;
    chatMessages.insertBefore(bubble, typingIndicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 3000);
}

// Uncomment to test the rematch flow:
// setTimeout(simulatePartnerLeft, 5000);