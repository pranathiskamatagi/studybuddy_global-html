document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  // ---------------------------------------------------------------
  // Read the group's topic from the URL. Two different pages link here:
  //   - group-subject.js sends: ?sessionId=..&subject=..&topic=..&level=..
  //   - Home/Connect's real "Join" sends: ?sessionId=..&topic=..&subtitle=..
  // ---------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const topic = params.get('topic') || 'Study Group';
  const subject = params.get('subject') || '';
  const level = params.get('level') || '';
  const subtitle = params.get('subtitle') || [subject, level].filter(Boolean).join(' · ');
  const sessionId = params.get('sessionId') || '';
  const myId = getStoredUser()?.id;

  // This page should never be opened with no real session to join - that
  // only happens from a stale bookmark/tab or typing the URL directly.
  // Same fix as connecting.html: send them back to pick a subject instead
  // of starting a fake conversation with made-up people.
  if (!sessionId) {
    window.location.href = 'group-subject.html';
    return;
  }

  const sessionStartTime = Date.now();
  document.getElementById('group-topic').textContent = topic;

  const messagesEl = document.getElementById('chat-messages');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const stackEl = document.getElementById('group-avatar-stack');

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  scrollToBottom(); // in case the seeded messages already overflow the box

  // WhatsApp-style tick marks, group version - "✓" once sent, "✓✓"
  // (highlighted) only once EVERY other CURRENT member's read state (see
  // sockets.py's 'read_receipt') has caught up to this message, not just
  // one of them. otherReadState maps userId -> their lastReadMessageId.
  const sentMessageTicks = new Map(); // messageId -> tick <span>
  let otherReadState = {};

  function isReadByEveryone(messageId) {
    const others = groupMembers.filter((m) => m.userId !== myId);
    if (others.length === 0) return false;
    return others.every((m) => (otherReadState[m.userId] || 0) >= messageId);
  }

  function renderTick(tickEl, messageId) {
    const isRead = isReadByEveryone(messageId);
    tickEl.textContent = isRead ? '✓✓' : '✓';
    tickEl.classList.toggle('tick-read', isRead);
  }

  function refreshAllTicks() {
    sentMessageTicks.forEach((tickEl, messageId) => renderTick(tickEl, messageId));
  }

  function markRead(messageId) {
    if (socket && messageId) socket.emit('mark_read', { session_id: Number(sessionId), message_id: messageId });
  }

  // EVERY message bubble (sent or received), so a later 'message_deleted'
  // can find and replace the right one live, no matter who sent it.
  const messageBubbles = new Map(); // messageId -> bubble <div>

  function renderDeletedBubble(bubble, senderName, isSent) {
    bubble.innerHTML = '';
    if (!isSent) {
      const senderEl = document.createElement('p');
      senderEl.className = 'msg-sender';
      senderEl.textContent = senderName;
      bubble.appendChild(senderEl);
    }
    const p = document.createElement('p');
    p.className = 'msg-deleted-text';
    p.textContent = 'This message was deleted';
    bubble.appendChild(p);
  }

  function addMessage(text, isSent, senderName, messageId, deleted, imageData) {
    const bubble = document.createElement('div');
    bubble.className = 'msg ' + (isSent ? 'msg-sent' : 'msg-received');

    if (messageId) messageBubbles.set(messageId, bubble);

    if (deleted) {
      renderDeletedBubble(bubble, senderName, isSent);
      messagesEl.appendChild(bubble);
      scrollToBottom();
      return;
    }

    if (!isSent) {
      const senderEl = document.createElement('p');
      senderEl.className = 'msg-sender';
      senderEl.textContent = senderName;
      bubble.appendChild(senderEl);
    }

    if (imageData) {
      // A real image message - already passed a Gemini safety check
      // server-side before this could ever arrive here, so it's safe to
      // just render directly. Same pattern as session.js's 1-on-1 chat.
      bubble.classList.add('msg-image');
      const img = document.createElement('img');
      img.src = imageData;
      img.alt = 'Shared image';
      bubble.appendChild(img);
    }
    if (text) {
      const p = document.createElement('p');
      p.textContent = text;
      bubble.appendChild(p);
    }

    // Only the sender can delete their own message - same rule the
    // server enforces (see sockets.py's 'delete_message').
    if (isSent && messageId) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'msg-delete-btn';
      deleteBtn.setAttribute('aria-label', 'Delete message');
      deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>';
      deleteBtn.addEventListener('click', () => {
        showConfirmModal('Delete this message?', () => {
          socket.emit('delete_message', { message_id: messageId });
        }, { confirmText: 'Delete', danger: true });
      });
      bubble.appendChild(deleteBtn);
    }

    if (isSent && messageId) {
      const tick = document.createElement('span');
      tick.className = 'msg-tick';
      renderTick(tick, messageId);
      bubble.appendChild(tick);
      sentMessageTicks.set(messageId, tick);
    }

    messagesEl.appendChild(bubble);
    scrollToBottom();
  }

  function handleMessageDeleted(messageId) {
    const bubble = messageBubbles.get(messageId);
    if (bubble) renderDeletedBubble(bubble, bubble.querySelector('.msg-sender')?.textContent, bubble.classList.contains('msg-sent'));
    sentMessageTicks.delete(messageId);
  }

  function addSystemNotice(text) {
    const p = document.createElement('p');
    p.className = 'system-notice';
    p.textContent = text;
    messagesEl.appendChild(p);
    scrollToBottom();
  }

  const avatarColors = ['blue', 'green', 'pink', 'orange'];

  function updateMemberCount(count) {
    document.getElementById('group-member-count').textContent =
      subtitle ? `${count} members · ${subtitle}` : `${count} members`;
  }

  let socket = null;
  let memberCount = 0;
  // The real current member list - kept around so the Report/Block
  // member picker (below) can build itself from real people, not a guess.
  let groupMembers = [];

  messagesEl.innerHTML = ''; // clear any placeholder markup left in the HTML

  // Beyond this many, showing one tiny avatar per person stops being
  // readable - the rest collapse into a single "+N" badge instead (same
  // idea most group chat apps use for their header avatar stack).
  const MAX_VISIBLE_AVATARS = 4;

  apiFetch(`/sessions/${sessionId}/members`)
    .then((data) => {
      groupMembers = data.members;
      stackEl.innerHTML = '';
      const visible = data.members.slice(0, MAX_VISIBLE_AVATARS);
      const overflowCount = data.members.length - visible.length;

      visible.forEach((m) => {
        const avatar = document.createElement('span');
        avatar.className = 'mini-avatar avatar-' + avatarColors[m.userId % avatarColors.length];
        if (m.photo) {
          const img = document.createElement('img');
          img.src = m.photo;
          img.alt = m.fullname;
          avatar.appendChild(img);
        } else {
          avatar.textContent = m.fullname.charAt(0).toUpperCase();
        }
        if (m.online) {
          const dot = document.createElement('span');
          dot.className = 'presence-dot';
          avatar.appendChild(dot);
        }
        stackEl.appendChild(avatar);
      });

      if (overflowCount > 0) {
        const overflowEl = document.createElement('span');
        overflowEl.className = 'mini-avatar mini-avatar-overflow';
        overflowEl.textContent = '+' + overflowCount;
        overflowEl.title = data.members.slice(MAX_VISIBLE_AVATARS).map((m) => m.fullname).join(', ');
        stackEl.appendChild(overflowEl);
      }

      memberCount = data.members.length;
      updateMemberCount(memberCount);
      // The member list just changed, which changes what "read by
      // everyone" even means - re-check already-shown ticks against it.
      refreshAllTicks();
    })
    .catch((error) => {
      if (handleAuthError(error)) return;
      console.warn('Could not load group members:', error.message);
    });

  // ---------------------------------------------------------------
  // Full member list - clicking the avatar stack opens it; clicking any
  // member in it opens their limited profile view (see
  // profile-view-modal.js).
  // ---------------------------------------------------------------
  const membersOverlay = document.getElementById('members-overlay');
  const memberListBody = document.getElementById('member-list-body');

  stackEl.addEventListener('click', () => {
    memberListBody.innerHTML = '';
    groupMembers.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'member-row';

      const avatar = document.createElement('span');
      avatar.className = 'mini-avatar avatar-' + avatarColors[m.userId % avatarColors.length];
      if (m.photo) {
        const img = document.createElement('img');
        img.src = m.photo;
        img.alt = m.fullname;
        avatar.appendChild(img);
      } else {
        avatar.textContent = m.fullname.charAt(0).toUpperCase();
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'member-row-name';
      nameSpan.textContent = m.fullname;
      if (m.isAdmin) {
        const badge = document.createElement('span');
        badge.className = 'admin-badge';
        badge.textContent = '🛡 Admin';
        nameSpan.append(' ', badge);
      }

      row.append(avatar, nameSpan);
      row.addEventListener('click', () => {
        membersOverlay.hidden = true;
        showProfileView(m.userId);
      });
      memberListBody.appendChild(row);
    });
    membersOverlay.hidden = false;
  });

  document.getElementById('members-close-btn').addEventListener('click', () => {
    membersOverlay.hidden = true;
  });
  membersOverlay.addEventListener('click', (event) => {
    if (event.target === membersOverlay) membersOverlay.hidden = true;
  });

  apiFetch(`/sessions/${sessionId}/messages`)
    .then((data) => {
      data.messages.forEach((m) => addMessage(m.text, m.senderId === myId, m.senderName, m.id, m.deleted, m.imageData));
      // Opening the chat means seeing everything already in it - mark up
      // to the newest loaded message as read right away.
      if (data.messages.length) {
        markRead(data.messages[data.messages.length - 1].id);
      }
    })
    .catch((error) => {
      if (handleAuthError(error)) return;
      console.warn('Could not load chat history:', error.message);
    });

  // Everyone else's real read state as of right now - see sockets.py's
  // 'read_receipt' below for how this stays live after this point.
  apiFetch(`/sessions/${sessionId}/read-state`)
    .then((data) => {
      data.reads.forEach((r) => { otherReadState[r.userId] = r.lastReadMessageId; });
      refreshAllTicks();
    })
    .catch((error) => console.warn('Could not load read state:', error.message));

  socket = io(SOCKET_BASE, { auth: { token: getToken() } });
  socket.emit('join', { session_id: Number(sessionId) });

  // ---------------------------------------------------------------
  // "X is typing..." - same pattern as session.js. In a group, this
  // just shows whoever typed MOST recently (like most group chat apps)
  // rather than trying to list everyone at once.
  // ---------------------------------------------------------------
  const typingIndicatorEl = document.getElementById('typing-indicator');
  let typingHideTimer = null;
  let lastTypingEmitAt = 0;
  const TYPING_EMIT_THROTTLE_MS = 2500;

  // Grows the textarea to fit what's typed (up to the CSS max-height,
  // where it switches to its own internal scrollbar instead) - matches
  // the CSS's max-height: 120px so the two stay in sync.
  const MAX_INPUT_HEIGHT = 120;
  function autoResizeInput() {
    input.style.height = 'auto'; // lets scrollHeight shrink back down too, not just grow
    input.style.height = Math.min(input.scrollHeight, MAX_INPUT_HEIGHT) + 'px';
  }

  input.addEventListener('input', () => {
    autoResizeInput();
    const now = Date.now();
    if (now - lastTypingEmitAt < TYPING_EMIT_THROTTLE_MS) return;
    lastTypingEmitAt = now;
    socket.emit('typing', { session_id: Number(sessionId) });
  });

  // A <textarea> doesn't submit its form on Enter by default - wire it
  // back up: plain Enter sends, Shift+Enter still inserts a line break.
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  socket.on('partner_typing', (data) => {
    typingIndicatorEl.textContent = `${data.name} is typing...`;
    typingIndicatorEl.hidden = false;
    clearTimeout(typingHideTimer);
    typingHideTimer = setTimeout(() => { typingIndicatorEl.hidden = true; }, 3000);
  });

  // A real Gemini address check (see safety.py) finishing a few seconds
  // after a message sent - shows right here in the chat where it's
  // actually useful, not on a separate Notifications page someone would
  // have to go check. Only for the SENDER (this socket is in their own
  // personal room), and only for THIS exact group chat.
  socket.on('safety_warning', (data) => {
    if (data.sessionId !== Number(sessionId)) return;
    addSystemNotice('⚠️ ' + data.message);
  });

  let lastMessageAt = Date.now();
  let quietNudgeShown = false;

  socket.on('new_message', (message) => {
    // The server broadcasts to EVERYONE in the room (sender included) -
    // that's what actually renders it, same pattern as session.js.
    const isSent = message.senderId === myId;
    addMessage(message.text, isSent, message.senderName, message.id, message.deleted, message.imageData);
    lastMessageAt = Date.now();
    quietNudgeShown = false;
    if (!isSent && typeof playMessageSound === 'function') playMessageSound();
    if (!isSent) {
      clearTimeout(typingHideTimer);
      typingIndicatorEl.hidden = true;
    }
    // The chat is open right now - counts as having seen it.
    markRead(message.id);
  });

  // Someone else in the group just read further - update any of OUR
  // already-on-screen sent messages whose "read by everyone" state might
  // have just changed.
  socket.on('read_receipt', (data) => {
    otherReadState[data.userId] = data.lastReadMessageId;
    refreshAllTicks();
  });

  socket.on('message_deleted', (data) => {
    handleMessageDeleted(data.messageId);
  });

  // Unlike a 1-on-1 chat, one member leaving doesn't end the group for
  // everyone else - just a small notice, chat carries on.
  socket.on('member_left', (data) => {
    addSystemNotice(`${data.name} left the group.`);
    memberCount = Math.max(0, memberCount - 1);
    updateMemberCount(memberCount);
    // Someone leaving changes who counts toward "read by everyone."
    refreshAllTicks();
  });

  // ---------------------------------------------------------------
  // Distraction nudges - two signals: quiet chat, and a server-side AI
  // check for topic drift.
  // ---------------------------------------------------------------
  const QUIET_THRESHOLD_MS = 3 * 60 * 1000;
  setInterval(() => {
    if (!quietNudgeShown && Date.now() - lastMessageAt >= QUIET_THRESHOLD_MS) {
      quietNudgeShown = true;
      addSystemNotice("It's gotten quiet - still there? 💬");
    }
  }, 15 * 1000);

  socket.on('distraction_nudge', (data) => {
    addSystemNotice(data.message);
  });

  function sendMessage(text) {
    socket.emit('send_message', { session_id: Number(sessionId), text });
    input.value = '';
    autoResizeInput(); // back to a single line, not still stretched tall
    // No local addMessage() here on purpose - 'new_message' above
    // renders it once the server echoes it back.
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    // Safety check - catches an accidental phone number/email/password
    // BEFORE it's sent, so the person can double-check first.
    const risk = detectRiskyContent(text);
    if (risk) {
      showConfirmModal(
        `This looks like it might contain ${risk}. Send it anyway?`,
        () => sendMessage(text),
        { confirmText: 'Send anyway' }
      );
      return;
    }

    sendMessage(text);
  });

  // ---------------------------------------------------------------
  // Real image sharing - same Gemini-safety-checked flow as session.js's
  // 1-on-1 chat, just posted to the same session/messages/image endpoint
  // (it already handles a group session's membership check too).
  // ---------------------------------------------------------------
  const imageBtn = document.getElementById('image-btn');
  const imageFileInput = document.getElementById('image-file-input');

  imageBtn.addEventListener('click', () => {
    if (!sessionId) return;
    imageFileInput.click();
  });

  imageFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    imageFileInput.value = ''; // lets picking the SAME file again re-fire 'change'
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Shrink to at most 1000px on the long side (keeping aspect
        // ratio) - same size cap session.js uses, for the same reasons.
        const MAX_SIZE = 1000;
        let { width, height } = img;
        if (width > height) {
          if (width > MAX_SIZE) { height = Math.round((height * MAX_SIZE) / width); width = MAX_SIZE; }
        } else if (height > MAX_SIZE) {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);

        const imageData = canvas.toDataURL('image/jpeg', 0.85);
        imageBtn.disabled = true;
        addSystemNotice('Checking image...');

        apiFetch(`/sessions/${sessionId}/messages/image`, {
          method: 'POST',
          body: JSON.stringify({ imageData }),
        })
          .then(() => {
            // No local addMessage() call here either, on purpose - same
            // as a text message, the 'new_message' broadcast is what
            // actually puts it on screen, for everyone the same way.
          })
          .catch((error) => {
            if (handleAuthError(error)) return;
            alert(error.message || 'Could not send that image.');
          })
          .finally(() => {
            imageBtn.disabled = false;
          });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('mic-btn').addEventListener('click', () => {
    alert('Voice messages aren\'t built yet.');
  });

  // ---------------------------------------------------------------
  // Safety menu
  // ---------------------------------------------------------------
  const safetyBtn = document.getElementById('safety-btn');
  const safetyMenu = document.getElementById('safety-menu');
  const memberPickerMenu = document.getElementById('member-picker-menu');

  function closeAllMenus() {
    safetyMenu.hidden = true;
    memberPickerMenu.hidden = true;
    safetyBtn.setAttribute('aria-expanded', 'false');
  }

  safetyBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!safetyMenu.hidden || !memberPickerMenu.hidden) {
      closeAllMenus();
      return;
    }
    safetyMenu.hidden = false;
    safetyBtn.setAttribute('aria-expanded', 'true');
  });

  document.addEventListener('click', closeAllMenus);

  // Report/Block only make sense pointed at ONE specific person in a
  // group, not the whole conversation at once - shows the real current
  // members (never yourself) as a second menu, then runs the chosen
  // action on whoever gets picked.
  function openMemberPicker(action) {
    const others = groupMembers.filter((m) => m.userId !== myId);
    memberPickerMenu.innerHTML = '';

    if (others.length === 0) {
      alert("There's no one else in this group yet.");
      return;
    }

    others.forEach((member) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'safety-option';
      btn.textContent = member.fullname;
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        closeAllMenus();
        if (action === 'report') {
          showConfirmModal(`Report ${member.fullname} for inappropriate behavior?`, () => {
            apiFetch('/reports', {
              method: 'POST',
              body: JSON.stringify({ reportedId: member.userId, sessionId: Number(sessionId) }),
            })
              .then(() => alert("Thanks for the report. Our safety team will review this within 24 hours."))
              .catch((error) => {
                if (handleAuthError(error)) return;
                alert('Could not send that report right now: ' + error.message);
              });
          }, { confirmText: 'Report', danger: true });
        } else {
          showConfirmModal(`Block ${member.fullname}? You won't be matched with them again.`, () => {
            apiFetch('/blocks', { method: 'POST', body: JSON.stringify({ user_id: member.userId }) })
              .then(() => alert(`You've blocked ${member.fullname}.`))
              .catch((error) => {
                if (handleAuthError(error)) return;
                alert('Could not block this person right now: ' + error.message);
              });
          }, { confirmText: 'Block', danger: true });
        }
      });
      memberPickerMenu.appendChild(btn);
    });

    safetyMenu.hidden = true;
    memberPickerMenu.hidden = false;
  }

  document.getElementById('report-btn').addEventListener('click', (event) => {
    event.stopPropagation();
    openMemberPicker('report');
  });
  document.getElementById('block-btn').addEventListener('click', (event) => {
    event.stopPropagation();
    openMemberPicker('block');
  });

  // Calls the real leave-group endpoint, which removes THIS person's
  // membership and awards their points - the only way membership is ever
  // removed now (a raw socket disconnect - a refresh, a network blip -
  // deliberately does NOT touch it anymore, see sockets.py).
  // Returns whether a diamond was ALSO earned, same as session.js.
  async function leaveAndAwardPoints() {
    const elapsedMinutes = Math.max(1, Math.round((Date.now() - sessionStartTime) / 60000));
    let diamondEarned = false;

    try {
      const data = await apiFetch(`/sessions/${sessionId}/leave-group`, {
        method: 'POST',
        body: JSON.stringify({ minutes: elapsedMinutes }),
      });
      diamondEarned = Boolean(data.diamondEarned);
    } catch (error) {
      if (handleAuthError(error)) throw error; // expired login - already redirecting
      console.warn('Could not award points for this session:', error.message);
    }

    if (socket) socket.disconnect();
    return { elapsedMinutes, diamondEarned };
  }

  // ---------------------------------------------------------------
  // Exit session - the one real way to leave a group now (no more
  // separate "Leave group" menu item duplicating this).
  // ---------------------------------------------------------------
  document.getElementById('end-session-btn').addEventListener('click', () => {
    showConfirmModal('Exit this study session?', async () => {
      let elapsedMinutes, diamondEarned;
      try {
        ({ elapsedMinutes, diamondEarned } = await leaveAndAwardPoints());
      } catch (error) {
        return; // handleAuthError already redirected to login
      }

      const endParams = new URLSearchParams({
        topic,
        subtitle,
        minutes: elapsedMinutes,
        sessionId: sessionId || '',
        // Group sessions always award the LEARN rate (gamification.py) -
        // lets group-session-end.js show a real "+N points" popup. Empty
        // string under the 10-minute minimum, same rule as session.js.
        pointsEarned: elapsedMinutes > 10 ? 100 : '',
        diamondEarned: diamondEarned ? '1' : '',
      });
      window.location.href = 'group-session-end.html?' + endParams.toString();
    }, { confirmText: 'Exit session' });
  });

});
