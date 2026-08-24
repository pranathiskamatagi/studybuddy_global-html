document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // Read who we're chatting with from the URL (?partner=..&color=..),
  // passed along by match-found.js's "Start Session" button.
  // ---------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const partnerName = params.get('partner') || 'Study Partner';
  const partnerColor = params.get('color') || 'blue';
  const topic = params.get('topic') || '';
  const country = params.get('country') || '';
  const flag = params.get('flag') || '';

  // Records the moment the session started, so we can show a REAL
  // elapsed time (not a fake number) once it ends.
  const sessionStartTime = Date.now();

  const avatarEl = document.getElementById('chat-avatar');
  avatarEl.textContent = partnerName.charAt(0);
  avatarEl.classList.add('avatar-' + partnerColor);
  document.getElementById('chat-partner-name').textContent = partnerName;
  document.getElementById('typing-name').textContent = partnerName;

  // ---------------------------------------------------------------
  // Sending and receiving messages
  // ---------------------------------------------------------------
  const messagesEl = document.getElementById('chat-messages');
  const typingEl = document.getElementById('typing-indicator');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');

  // A few generic replies - there's no real backend, so once you send a
  // message, we simulate a response by picking one of these at random
  // (the same Math.random() pattern used in match-found.js).
  const cannedReplies = [
    "That makes sense, thanks for explaining!",
    "Oh interesting, I hadn't thought of it that way.",
    "Can you give me an example of that?",
    "Got it. What's the next step?",
    "That's a great question - let me think about it.",
    "Makes sense so far, keep going!",
  ];

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  scrollToBottom(); // in case the seeded messages already overflow the box

  function addMessage(text, isSent) {
    const bubble = document.createElement('div');
    bubble.className = 'msg ' + (isSent ? 'msg-sent' : 'msg-received');
    const p = document.createElement('p');
    p.textContent = text;
    bubble.appendChild(p);
    messagesEl.appendChild(bubble);
    scrollToBottom();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const text = input.value.trim();
    if (!text) return; // ignore submitting an empty message

    addMessage(text, true);
    input.value = '';

    // Show "X is typing..." for a moment, then reply - setTimeout delays
    // the reply so it feels like the other person is actually composing it.
    typingEl.hidden = false;
    scrollToBottom();

    setTimeout(() => {
      typingEl.hidden = true;
      const reply = cannedReplies[Math.floor(Math.random() * cannedReplies.length)];
      addMessage(reply, false);
    }, 1600);
  });

  // ---------------------------------------------------------------
  // Image / voice buttons - not built yet
  // ---------------------------------------------------------------
  document.getElementById('image-btn').addEventListener('click', () => {
    alert('Image sharing isn\'t built yet.');
  });
  document.getElementById('mic-btn').addEventListener('click', () => {
    alert('Voice messages aren\'t built yet.');
  });

  // ---------------------------------------------------------------
  // Safety menu: toggles open/closed, and closes if you click anywhere
  // else on the page.
  // ---------------------------------------------------------------
  const safetyBtn = document.getElementById('safety-btn');
  const safetyMenu = document.getElementById('safety-menu');

  safetyBtn.addEventListener('click', (event) => {
    // Without this, the click would immediately bubble up to the
    // document-level listener below and close the menu the instant
    // it opens.
    event.stopPropagation();

    const isCurrentlyOpen = !safetyMenu.hidden;
    safetyMenu.hidden = isCurrentlyOpen;
    safetyBtn.setAttribute('aria-expanded', String(!isCurrentlyOpen));
  });

  document.addEventListener('click', () => {
    safetyMenu.hidden = true;
    safetyBtn.setAttribute('aria-expanded', 'false');
  });

  // ---------------------------------------------------------------
  // Report / Block - real safety actions, so each one confirms first.
  // showConfirmModal (from confirm-modal.js) replaces the browser's
  // plain confirm() popup with our own styled version - see that file
  // for why it needs a CALLBACK instead of an if-statement.
  // ---------------------------------------------------------------
  document.getElementById('report-btn').addEventListener('click', () => {
    showConfirmModal(`Report ${partnerName} for inappropriate behavior?`, () => {
      alert("Thanks for the report. Our safety team will review this within 24 hours.");
    }, { confirmText: 'Report', danger: true });
  });

  document.getElementById('block-btn').addEventListener('click', () => {
    showConfirmModal(`Block ${partnerName}? You won't be matched with them again, and this session will end.`, () => {
      alert(`You've blocked ${partnerName}.`);
      window.location.href = 'home.html';
    }, { confirmText: 'Block', danger: true });
  });

  // ---------------------------------------------------------------
  // End session
  // ---------------------------------------------------------------
  document.getElementById('end-session-btn').addEventListener('click', () => {
    showConfirmModal('End this session?', () => {
      // Math.max(1, ...) means even a very short test session still
      // shows "1 min" instead of a slightly odd "0 min".
      const elapsedMinutes = Math.max(1, Math.round((Date.now() - sessionStartTime) / 60000));
      const endParams = new URLSearchParams({
        partner: partnerName,
        color: partnerColor,
        topic,
        country,
        flag,
        minutes: elapsedMinutes,
      });
      window.location.href = 'session-end.html?' + endParams.toString();
    }, { confirmText: 'End session' });
  });

});
