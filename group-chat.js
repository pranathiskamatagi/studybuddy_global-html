document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // Read the group's topic from the URL. Two different pages link
  // here with slightly different info:
  //   - group-subject.js sends: ?subject=..&topic=..&level=..
  //   - home.js's "Join" buttons send: ?topic=..&subtitle=..
  // ---------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const topic = params.get('topic') || 'Study Group';
  const subject = params.get('subject') || '';
  const level = params.get('level') || '';
  const subtitle = params.get('subtitle') || [subject, level].filter(Boolean).join(' · ');

  const sessionStartTime = Date.now();

  document.getElementById('group-topic').textContent = topic;

  // ---------------------------------------------------------------
  // A small pool of mock group members - there's no real backend, so
  // this group is always "populated" with the same few people.
  // ---------------------------------------------------------------
  const members = [
    { name: 'Sofia Martinez', color: 'pink' },
    { name: 'Kabir Singh', color: 'orange' },
    { name: 'Marcus Chen', color: 'green' },
  ];

  const stackEl = document.getElementById('group-avatar-stack');
  members.forEach((member) => {
    const avatar = document.createElement('span');
    avatar.className = 'mini-avatar avatar-' + member.color;
    avatar.textContent = member.name.charAt(0);
    stackEl.appendChild(avatar);
  });
  const countBadge = document.createElement('span');
  countBadge.className = 'mini-avatar avatar-count';
  countBadge.textContent = '+1'; // +you
  stackEl.appendChild(countBadge);

  document.getElementById('group-member-count').textContent =
    subtitle ? `${members.length + 1} members · ${subtitle}` : `${members.length + 1} members`;

  // ---------------------------------------------------------------
  // Sending and receiving messages - same pattern as session.js, but
  // replies come from a RANDOM member instead of one fixed partner.
  // ---------------------------------------------------------------
  const messagesEl = document.getElementById('chat-messages');
  const typingEl = document.getElementById('typing-indicator');
  const typingNameEl = document.getElementById('typing-name');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');

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
  scrollToBottom();

  function addMessage(text, isSent, senderName) {
    const bubble = document.createElement('div');
    bubble.className = 'msg ' + (isSent ? 'msg-sent' : 'msg-received');

    if (!isSent) {
      const senderEl = document.createElement('p');
      senderEl.className = 'msg-sender';
      senderEl.textContent = senderName;
      bubble.appendChild(senderEl);
    }

    const p = document.createElement('p');
    p.textContent = text;
    bubble.appendChild(p);

    messagesEl.appendChild(bubble);
    scrollToBottom();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const text = input.value.trim();
    if (!text) return;

    addMessage(text, true);
    input.value = '';

    // Picks a random member to "reply" - a different one each time,
    // which is what makes a group chat feel like more than one person.
    const randomMember = members[Math.floor(Math.random() * members.length)];
    typingNameEl.textContent = randomMember.name;
    typingEl.hidden = false;
    scrollToBottom();

    setTimeout(() => {
      typingEl.hidden = true;
      const reply = cannedReplies[Math.floor(Math.random() * cannedReplies.length)];
      addMessage(reply, false, randomMember.name);
    }, 1600);
  });

  document.getElementById('image-btn').addEventListener('click', () => {
    alert('Image sharing isn\'t built yet.');
  });
  document.getElementById('mic-btn').addEventListener('click', () => {
    alert('Voice messages aren\'t built yet.');
  });

  // ---------------------------------------------------------------
  // Safety menu
  // ---------------------------------------------------------------
  const safetyBtn = document.getElementById('safety-btn');
  const safetyMenu = document.getElementById('safety-menu');

  safetyBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const isCurrentlyOpen = !safetyMenu.hidden;
    safetyMenu.hidden = isCurrentlyOpen;
    safetyBtn.setAttribute('aria-expanded', String(!isCurrentlyOpen));
  });

  document.addEventListener('click', () => {
    safetyMenu.hidden = true;
    safetyBtn.setAttribute('aria-expanded', 'false');
  });

  // Report here is about the GROUP conversation as a whole, not one
  // specific person - a real app would let you report a single message,
  // but that's a bigger feature than this app needs right now.
  document.getElementById('report-btn').addEventListener('click', () => {
    showConfirmModal('Report something inappropriate in this group chat?', () => {
      alert("Thanks for the report. Our safety team will review this within 24 hours.");
    }, { confirmText: 'Report', danger: true });
  });

  // "Leave group" replaces "Block" - it doesn't make sense to block an
  // entire group of people the way you'd block one study partner.
  document.getElementById('leave-btn').addEventListener('click', () => {
    showConfirmModal('Leave this group chat?', () => {
      alert("You've left the group.");
      window.location.href = 'home.html';
    }, { confirmText: 'Leave group', danger: true });
  });

  // ---------------------------------------------------------------
  // End chat
  // ---------------------------------------------------------------
  document.getElementById('end-session-btn').addEventListener('click', () => {
    showConfirmModal('Exit this group chat?', () => {
      const elapsedMinutes = Math.max(1, Math.round((Date.now() - sessionStartTime) / 60000));
      const endParams = new URLSearchParams({
        topic,
        subtitle,
        members: members.length + 1,
        minutes: elapsedMinutes,
      });
      window.location.href = 'group-session-end.html?' + endParams.toString();
    }, { confirmText: 'Exit chat' });
  });

});
