document.addEventListener('DOMContentLoaded', async () => {

  if (!requireLogin()) return;

  // ---------------------------------------------------------------
  // Read who we're chatting with from the URL (?partner=..&color=..),
  // passed along by match-found.js's "Start Session" button.
  // ---------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const partnerName = params.get('partner') || 'Study Partner';
  const partnerColor = params.get('color') || 'blue';
  const topic = params.get('topic') || '';
  const subject = params.get('subject') || '';
  const level = params.get('level') || '';
  const mode = params.get('mode') || 'learn';
  const country = params.get('country') || '';
  const flag = params.get('flag') || '';
  // Set whenever match-found.js found a REAL other signed-up user to
  // match with - a real 1-on-1 session always has one.
  const partnerId = params.get('partnerId') || '';
  // Set ONLY when this page was reached via the live auto-redirect (see
  // api.js's goToStartedSession) - the OTHER person already created the
  // real session row via their own "Start Session" click. Without this,
  // this side would call POST /sessions again and create a SEPARATE,
  // disconnected session instead of joining the one that already exists.
  const existingSessionId = params.get('sessionId') || '';
  const myId = getStoredUser()?.id;

  // This page should never be opened with no real partner - that only
  // happens from a stale bookmark/tab or typing the URL directly. Same
  // fix as connecting.html: send them back to pick a subject instead of
  // starting a fake conversation with a made-up person.
  if (!partnerId) {
    window.location.href = 'choose-subject.html';
    return;
  }

  // Records the moment the session started, so we can show a REAL
  // elapsed time (not a fake number) once it ends.
  const sessionStartTime = Date.now();

  // ---------------------------------------------------------------
  // Tell the backend a session has started - AWAITED before anything
  // else renders.
  // ---------------------------------------------------------------
  let sessionId = null;
  // True only when THIS click genuinely just created the session row -
  // nobody's confirmed joining it yet (see sessions.py's `created` flag).
  // Used below to show a "waiting for X to join" state instead of just
  // assuming they're already there - a real partner could still be
  // mid-page-transition, reconnecting after a dropped connection, or on a
  // backgrounded/incognito tab that's slow to reconnect its socket.
  let sessionWasCreated = false;
  if (existingSessionId) {
    // The OTHER person already created this real session (we got pulled
    // in live via the auto-redirect) - just use it directly, no need to
    // create a second one.
    sessionId = existingSessionId;
  } else {
    try {
      const data = await apiFetch('/sessions', {
        method: 'POST',
        body: JSON.stringify({ mode, subject, topic, level, partner_id: partnerId || undefined }),
      });
      sessionId = data.session.id;
      sessionWasCreated = Boolean(data.created);
    } catch (error) {
      if (handleAuthError(error)) return; // expired login - already redirecting
      // Any failure shouldn't block the chat itself - worst case, this
      // session's points don't get awarded at the end.
      console.warn('Could not start a tracked session:', error.message);
    }
  }

  const avatarEl = document.getElementById('chat-avatar');
  avatarEl.textContent = partnerName.charAt(0);
  avatarEl.classList.add('avatar-' + partnerColor);
  const partnerNameEl = document.getElementById('chat-partner-name');
  partnerNameEl.textContent = partnerName;

  // Clicking either the avatar or the name shows the same limited profile
  // view (see profile-view-modal.js) - real people only have a real
  // partnerId, never a fake demo person.
  if (partnerId) {
    document.querySelector('.chat-partner').classList.add('clickable');
    document.querySelector('.chat-partner').addEventListener('click', () => showProfileView(partnerId));

    // Also fetch just enough to know whether to show the Admin badge next
    // to their name here - the popup gets this itself when opened, but the
    // header badge needs it up front.
    apiFetch(`/users/${partnerId}/profile-preview`)
      .then((data) => {
        if (data.user.isAdmin) {
          const badge = document.createElement('span');
          badge.className = 'admin-badge';
          badge.textContent = '🛡 Admin';
          partnerNameEl.append(' ', badge);
        }
      })
      .catch(() => {}); // purely decorative - never worth breaking the chat over
  }

  // ---------------------------------------------------------------
  // Sending and receiving messages
  // ---------------------------------------------------------------
  const messagesEl = document.getElementById('chat-messages');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  scrollToBottom(); // in case the seeded messages already overflow the box

  // WhatsApp-style tick marks - "✓" once sent, "✓✓" (highlighted) once
  // the partner's OWN last-read point (see 'read_receipt' below) has
  // caught up to this exact message. Kept per messageId so a later
  // read_receipt can update an ALREADY-ON-SCREEN bubble's tick live,
  // without re-rendering the whole chat.
  const sentMessageTicks = new Map(); // messageId -> tick <span>
  // EVERY message bubble (sent or received), so a later 'message_deleted'
  // can find and replace the right one live, no matter who sent it.
  const messageBubbles = new Map(); // messageId -> bubble <div>
  let partnerReadUpTo = 0;

  function renderTick(tickEl, messageId) {
    const isRead = messageId <= partnerReadUpTo;
    tickEl.textContent = isRead ? '✓✓' : '✓';
    tickEl.classList.toggle('tick-read', isRead);
  }

  // Replaces a bubble's content with the deleted placeholder, whether
  // that's happening live (the sender just deleted it) or on initial
  // history load (it was already deleted before this page opened).
  function renderDeletedBubble(bubble) {
    bubble.classList.remove('msg-image');
    bubble.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'msg-deleted-text';
    p.textContent = 'This message was deleted';
    bubble.appendChild(p);
  }

  function addMessage(text, isSent, imageData, messageId, deleted) {
    const bubble = document.createElement('div');
    bubble.className = 'msg ' + (isSent ? 'msg-sent' : 'msg-received');

    if (messageId) messageBubbles.set(messageId, bubble);

    if (deleted) {
      renderDeletedBubble(bubble);
      messagesEl.appendChild(bubble);
      scrollToBottom();
      return;
    }

    if (imageData) {
      // A real image message (see the image button below) - already
      // passed a Gemini safety check server-side before this could ever
      // arrive here, so it's safe to just render directly.
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

  // The sender (possibly us, on another tab/device) deleted this message -
  // update it live for whoever's looking at it right now.
  function handleMessageDeleted(messageId) {
    const bubble = messageBubbles.get(messageId);
    if (bubble) renderDeletedBubble(bubble);
    sentMessageTicks.delete(messageId); // nothing left to show a tick on
  }

  // Tells the server "I've now seen up to this message" - see
  // sockets.py's 'mark_read'. Fire-and-forget; nothing in the UI depends
  // on this succeeding immediately.
  function markRead(messageId) {
    if (socket && messageId) socket.emit('mark_read', { session_id: sessionId, message_id: messageId });
  }

  // A small centered line, distinct from a real chat bubble - used for
  // "X left" AND for distraction nudges (nobody actually said this).
  function addSystemNotice(text) {
    const p = document.createElement('p');
    p.className = 'system-notice';
    p.textContent = text;
    messagesEl.appendChild(p);
    scrollToBottom();
  }

  let socket = null;

  // Shared by both the manual "End session" click and the automatic
  // "partner left" handler below - awards points for the time actually
  // spent, same as always, regardless of WHY the session is ending.
  // Returns whether a diamond was ALSO earned (every 2 completed
  // sessions), so the caller can celebrate that too.
  async function awardSessionPoints(elapsedMinutes) {
    if (!sessionId) return false;
    try {
      const data = await apiFetch(`/sessions/${sessionId}/end`, {
        method: 'POST',
        body: JSON.stringify({ minutes: elapsedMinutes }),
      });
      return Boolean(data.diamondEarned);
    } catch (error) {
      if (handleAuthError(error)) throw error; // expired login - already redirecting
      // A failed award shouldn't trap the user here either way.
      console.warn('Could not award points for this session:', error.message);
      return false;
    }
  }

  socket = io(SOCKET_BASE, { auth: { token: getToken() } });

  // ---------------------------------------------------------------
  // "X is typing..." - a live signal only, never persisted (see
  // sockets.py's 'typing' handler, a pure relay with no DB write).
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
    if (!sessionId) return;
    const now = Date.now();
    if (now - lastTypingEmitAt < TYPING_EMIT_THROTTLE_MS) return;
    lastTypingEmitAt = now;
    socket.emit('typing', { session_id: sessionId });
  });

  // A <textarea> doesn't submit its form on Enter by default (that's what
  // makes multi-line typing possible in the first place) - wire it back
  // up to match how a chat input is expected to behave: plain Enter
  // sends, Shift+Enter still inserts a real line break.
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  socket.on('partner_typing', (data) => {
    typingIndicatorEl.textContent = `${data.name} is typing...`;
    typingIndicatorEl.hidden = false;
    // Hides itself automatically if no further typing event arrives -
    // there's no explicit "stopped typing" event, so this timeout IS
    // the stop signal.
    clearTimeout(typingHideTimer);
    typingHideTimer = setTimeout(() => { typingIndicatorEl.hidden = true; }, 3000);
  });

  // A real Gemini address check (see safety.py) finishing a few seconds
  // after a message sent - shows right here in the chat where it's
  // actually useful, not just on a separate Notifications page someone
  // would have to go check to ever see it. Only for the SENDER (this
  // socket is in their own personal room), and only if it's about THIS
  // exact chat - the same account could have another chat open elsewhere.
  socket.on('safety_warning', (data) => {
    if (data.sessionId !== Number(sessionId)) return;
    addSystemNotice('⚠️ ' + data.message);
  });

  let lastMessageAt = Date.now();
  let quietNudgeShown = false;

  socket.on('new_message', (message) => {
    // The server broadcasts to EVERYONE in the room, sender included -
    // that's what actually puts a message on screen, rather than
    // rendering it locally the instant it's sent. Both people see
    // messages appear the exact same way.
    const isSent = message.senderId === myId;
    addMessage(message.text, isSent, message.imageData, message.id, message.deleted);
    lastMessageAt = Date.now();
    quietNudgeShown = false;
    // Only for messages FROM the other person - sending your own doesn't
    // need an audio cue, you can already see it appear.
    if (!isSent && typeof playMessageSound === 'function') playMessageSound();
    // The message just arrived, so they're clearly done typing it.
    if (!isSent) {
      clearTimeout(typingHideTimer);
      typingIndicatorEl.hidden = true;
    }
    // The chat is open right now (this socket is live and receiving) -
    // counts as having seen it, same as it appearing on a real phone
    // screen. Marking OUR OWN sent messages read here too is harmless -
    // the server only ever uses this to update what the PARTNER sees.
    markRead(message.id);
  });

  // ---------------------------------------------------------------
  // Distraction nudges - two signals:
  // 1) Chat's gone quiet for a while.
  // 2) The AI notices the conversation has drifted off-topic (server-
  //    side, see 'distraction_nudge' below - can't be instant, since it
  //    needs to actually read and reason about the recent messages).
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

  // ONE shared grace period covers BOTH ways this chat can end up
  // partner-less: (1) they disconnect mid-chat (a network blip, a phone
  // screen locking, an accidental tab close, clicking End Session), or
  // (2) this side just created the session and the partner hasn't shown
  // up yet at all - which used to be treated as an instant, unforgiving
  // "they're offline" failure, even though a real partner could just be
  // mid-page-transition or on a backgrounded/incognito tab that's slow to
  // reconnect its socket. Either way: wait REJOIN_GRACE_MS for a REAL
  // 'partner_joined' signal before giving up and searching for someone
  // new - not a guess, an actual confirmation they're (still/now) here.
  const REJOIN_GRACE_MS = 60 * 1000;
  let rematchTimer = null;

  function startRematchGracePeriod(noticeText, leftName) {
    if (rematchTimer) return; // already waiting
    addSystemNotice(noticeText);

    rematchTimer = setTimeout(async () => {
      rematchTimer = null;
      const elapsedMinutes = Math.max(1, Math.round((Date.now() - sessionStartTime) / 60000));
      try {
        await awardSessionPoints(elapsedMinutes);
      } catch (error) {
        return; // handleAuthError already redirected to login - don't ALSO navigate below
      }

      const newSearchParams = new URLSearchParams({
        subject, topic, level, mode,
        left: leftName || partnerName,
        // So the next search can't immediately re-match you with the
        // exact same person who just left.
        excludeId: partnerId,
      });
      window.location.href = 'connecting.html?' + newSearchParams.toString();
    }, REJOIN_GRACE_MS);
  }

  // The server emits this when the OTHER person disconnects - see
  // startRematchGracePeriod above for why this waits instead of
  // redirecting instantly.
  socket.on('partner_left', (data) => {
    startRematchGracePeriod(`${data.name || partnerName} left - waiting to see if they reconnect...`, data.name);
  });

  // They actually joined (or came back) within the grace window - cancel
  // any pending rematch and let the chat carry on as if nothing happened.
  socket.on('partner_joined', (data) => {
    if (!rematchTimer) return;
    clearTimeout(rematchTimer);
    rematchTimer = null;
    addSystemNotice(`${data.name || partnerName} is here!`);
  });

  // The OTHER person deliberately clicked "End Session" - sessions.py's
  // end_session() already awarded THIS side's points/diamond too (it
  // can't wait for a second POST /end call from us, since the session
  // row is already closed the instant they end it) and sends the result
  // straight in this payload. Go to session-end.html the exact same way
  // clicking End Session ourselves would - NOT the reconnect-grace-period
  // ('partner_left' below is only for a genuinely unexpected disconnect,
  // never a deliberate end - this is the fix for exactly that mix-up).
  socket.on('partner_ended', (data) => {
    if (rematchTimer) {
      clearTimeout(rematchTimer);
      rematchTimer = null;
    }
    const endParams = new URLSearchParams({
      partner: data.name || partnerName,
      color: partnerColor,
      topic,
      country,
      flag,
      minutes: data.minutes,
      sessionId: sessionId || '',
      partnerId: partnerId || '',
      pointsEarned: data.minutes > 10 ? (mode === 'teach' ? 150 : 100) : '',
      diamondEarned: data.diamondEarned ? '1' : '',
    });
    window.location.href = 'session-end.html?' + endParams.toString();
  });

  // This click just created the session - nobody's confirmed joining it
  // yet, so start the SAME grace period rather than assuming the partner
  // (who may just be mid-page-transition right now) is already here.
  if (sessionWasCreated) {
    startRematchGracePeriod(`Waiting for ${partnerName} to join...`);
  }

  // The session id is already final at this point (awaited above), so
  // there's no need to wait any further before joining the chat room.
  if (sessionId) {
    socket.emit('join', { session_id: sessionId });

    // Load whatever was already said before this page loaded (e.g.
    // reconnecting after a refresh).
    apiFetch(`/sessions/${sessionId}/messages`)
      .then((data) => {
        data.messages.forEach((m) => addMessage(m.text, m.senderId === myId, m.imageData, m.id, m.deleted));
        // Opening the chat means seeing everything already in it -
        // mark up to the newest loaded message as read right away.
        if (data.messages.length) {
          markRead(data.messages[data.messages.length - 1].id);
        }
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        console.warn('Could not load chat history:', error.message);
      });

    // The partner's OWN read state as of right now - see sockets.py's
    // 'read_receipt' below for how this stays live after this point.
    apiFetch(`/sessions/${sessionId}/read-state`)
      .then((data) => {
        const partnerState = data.reads.find((r) => r.userId === Number(partnerId));
        if (partnerState) {
          partnerReadUpTo = partnerState.lastReadMessageId;
          sentMessageTicks.forEach((tickEl, messageId) => renderTick(tickEl, messageId));
        }
      })
      .catch((error) => console.warn('Could not load read state:', error.message));
  }

  // The partner just read further into the chat - update any of OUR
  // already-on-screen sent messages whose tick should now flip to "read".
  socket.on('read_receipt', (data) => {
    if (data.userId !== Number(partnerId)) return;
    partnerReadUpTo = data.lastReadMessageId;
    sentMessageTicks.forEach((tickEl, messageId) => renderTick(tickEl, messageId));
  });

  socket.on('message_deleted', (data) => {
    handleMessageDeleted(data.messageId);
  });

  function sendMessage(text) {
    socket.emit('send_message', { session_id: sessionId, text });
    input.value = '';
    autoResizeInput(); // back to a single line, not still stretched tall
    // No local addMessage() call here on purpose - the 'new_message'
    // listener above renders it once the server echoes it back.
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !sessionId) return;

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
  // Real image sharing - resized/compressed entirely in the browser
  // first (same canvas approach as edit-profile.js's photo picker, just
  // a bigger max size since this needs to be readable in chat, not a
  // tiny avatar), THEN checked by Gemini server-side for anything unsafe
  // BEFORE it's ever saved or shown to the other person - see
  // image_safety.py. Nothing appears in either person's chat unless that
  // check actually passes.
  // ---------------------------------------------------------------
  const imageBtn = document.getElementById('image-btn');
  const imageFileInput = document.getElementById('image-file-input');

  imageBtn.addEventListener('click', () => {
    if (!sessionId) return; // nothing to attach the message to yet
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
        // ratio) - big enough to actually read in a chat bubble, small
        // enough to stay well under the backend's size cap and upload
        // quickly even on a slow connection.
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
            // actually puts it on screen, for both people the same way.
          })
          .catch((error) => {
            if (handleAuthError(error)) return;
            // A real, specific reason from image_safety.py when flagged -
            // an honest explanation, not a generic failure.
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
      apiFetch('/reports', {
        method: 'POST',
        body: JSON.stringify({ reportedId: Number(partnerId), sessionId: sessionId || undefined }),
      })
        .then(() => alert("Thanks for the report. Our safety team will review this within 24 hours."))
        .catch((error) => {
          if (handleAuthError(error)) return;
          alert('Could not send that report right now: ' + error.message);
        });
    }, { confirmText: 'Report', danger: true });
  });

  document.getElementById('block-btn').addEventListener('click', () => {
    showConfirmModal(`Block ${partnerName}? You won't be matched with them again, and this session will end.`, () => {
      apiFetch('/blocks', { method: 'POST', body: JSON.stringify({ user_id: Number(partnerId) }) })
        .then(() => {
          alert(`You've blocked ${partnerName}.`);
          window.location.href = 'home.html';
        })
        .catch((error) => {
          if (handleAuthError(error)) return;
          alert('Could not block this person right now: ' + error.message);
        });
    }, { confirmText: 'Block', danger: true });
  });

  // ---------------------------------------------------------------
  // End session
  // ---------------------------------------------------------------
  document.getElementById('end-session-btn').addEventListener('click', () => {
    showConfirmModal('End this session?', async () => {
      // Math.max(1, ...) means even a very short test session still
      // shows "1 min" instead of a slightly odd "0 min".
      const elapsedMinutes = Math.max(1, Math.round((Date.now() - sessionStartTime) / 60000));

      let diamondEarned = false;
      try {
        diamondEarned = await awardSessionPoints(elapsedMinutes);
      } catch (error) {
        return; // handleAuthError already redirected to login
      }
      // awardSessionPoints() above (POST /sessions/<id>/end) already
      // awarded the OTHER person's points too and pushed them a
      // 'partner_ended' event with the result - see sessions.py and our
      // own 'partner_ended' handler above. Disconnecting now is just
      // cleanup on our side; sockets.py's disconnect handler recognizes
      // the session is already cleanly ended and won't emit a redundant/
      // conflicting 'partner_left' because of it.
      if (socket) socket.disconnect();

      const endParams = new URLSearchParams({
        partner: partnerName,
        color: partnerColor,
        topic,
        country,
        flag,
        minutes: elapsedMinutes,
        // Carried through so rate-partner.html knows WHICH session to
        // attach the rating to (sessionId can be missing if the initial
        // "start session" call failed - session-end.js handles that).
        sessionId: sessionId || '',
        // Carried through so a rating on a REAL match can set a real
        // ratee_id (not just a name) - see rate-partner.js.
        partnerId: partnerId || '',
        // The exact point rule from gamification.py - lets session-end.js
        // show a real "+N points earned" popup, not a guess. Sessions of
        // 10 minutes or under don't earn points at all (same 10-minute
        // minimum the backend enforces) - empty string here means no
        // popup, rather than showing a number that was never awarded.
        pointsEarned: elapsedMinutes > 10 ? (mode === 'teach' ? 150 : 100) : '',
        diamondEarned: diamondEarned ? '1' : '',
      });
      window.location.href = 'session-end.html?' + endParams.toString();
    }, { confirmText: 'End session' });
  });

});
