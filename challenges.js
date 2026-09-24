document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const listEl = document.getElementById('challenge-list');
  const emptyStateEl = document.getElementById('empty-state');
  const myId = getStoredUser()?.id;

  function buildRow(c) {
    const iAmChallenger = c.challengerId === myId;
    const otherName = iAmChallenger ? c.challengedName : c.challengerName;

    const row = document.createElement('div');
    row.className = 'challenge-row';

    const top = document.createElement('div');
    top.className = 'challenge-top';
    const names = document.createElement('p');
    names.className = 'challenge-names';
    names.textContent = `${c.topic}${c.subject ? ' · ' + c.subject : ''}`;
    const statusTag = document.createElement('span');
    statusTag.className = 'challenge-status-tag status-' + c.status;
    statusTag.textContent = c.status === 'pending' ? 'Pending' : 'Completed';
    top.append(names, statusTag);

    const withP = document.createElement('p');
    withP.className = 'challenge-with';
    withP.textContent = iAmChallenger ? `You challenged ${otherName}` : `${otherName} challenged you`;

    row.append(top, withP);

    if (c.status === 'completed') {
      const scoreP = document.createElement('p');
      scoreP.className = 'challenge-score';
      const myScore = iAmChallenger ? c.challengerScore : c.challengedScore;
      const theirScore = iAmChallenger ? c.challengedScore : c.challengerScore;
      // A challenge sent without playing it first has no challenger score
      // at all - nothing to compare against, so no "won/tied" verdict.
      if (myScore === null || theirScore === null) {
        const playedScore = myScore === null ? theirScore : myScore;
        const playedName = myScore === null ? otherName : 'You';
        scoreP.textContent = `${playedName}: ${playedScore}/${c.totalQuestions} - this one was sent without a score to beat.`;
      } else {
        const verdict = myScore === theirScore ? "It's a tie!" : myScore > theirScore ? 'You won! 🎉' : `${otherName} won this one.`;
        scoreP.textContent = `You: ${myScore}/${c.totalQuestions} · ${otherName}: ${theirScore}/${c.totalQuestions} - ${verdict}`;
      }
      row.appendChild(scoreP);
    } else if (!iAmChallenger) {
      const playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.className = 'challenge-play-btn';
      playBtn.textContent = 'Play now';
      playBtn.addEventListener('click', () => {
        window.location.href = 'challenge-quiz.html?challengeId=' + c.id;
      });
      row.appendChild(playBtn);
    } else {
      const waitingP = document.createElement('p');
      waitingP.className = 'challenge-waiting';
      waitingP.textContent = 'Waiting for them to play...';
      row.appendChild(waitingP);
    }

    return row;
  }

  apiFetch('/challenges')
    .then((data) => {
      if (data.challenges.length === 0) {
        listEl.hidden = true;
        emptyStateEl.hidden = false;
        return;
      }
      data.challenges.forEach((c) => listEl.appendChild(buildRow(c)));
    })
    .catch((error) => {
      if (handleAuthError(error)) return;
      listEl.hidden = true;
      emptyStateEl.hidden = false;
    });

  document.getElementById('back-btn').addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });

  // ---------------------------------------------------------------
  // "+ New" - the OTHER, real way to challenge someone, not only from
  // their profile popup while already looking at it (see
  // people-picker.js). Picking subject/topic here, then challenge-quiz.js
  // takes it from there - generate a real quiz, take it, send the result.
  // ---------------------------------------------------------------
  const proposeForm = document.getElementById('propose-form');
  const proposePartnerNameEl = document.getElementById('propose-partner-name');
  const proposeStatusEl = document.getElementById('propose-form-status');
  let proposeTargetId = null;
  let selectedLevel = '';
  let selectedCount = 5;

  const levelButtons = document.querySelectorAll('#propose-level-row .propose-level-btn');
  levelButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const alreadySelected = btn.classList.contains('selected');
      levelButtons.forEach((b) => b.classList.remove('selected'));
      // Clicking the already-selected level deselects it (back to "no
      // preference") instead of being stuck always picking one.
      selectedLevel = alreadySelected ? '' : btn.dataset.level;
      if (!alreadySelected) btn.classList.add('selected');
    });
  });

  // Defaults to 5 (the same default the backend falls back to), so
  // picking a count is optional, not required, before sending.
  const countButtons = document.querySelectorAll('#propose-count-row .propose-level-btn');
  countButtons.forEach((btn) => {
    if (Number(btn.dataset.count) === selectedCount) btn.classList.add('selected');
    btn.addEventListener('click', () => {
      countButtons.forEach((b) => b.classList.remove('selected'));
      selectedCount = Number(btn.dataset.count);
      btn.classList.add('selected');
    });
  });

  document.getElementById('add-challenge-btn').addEventListener('click', () => {
    showPeoplePicker((person) => {
      proposeTargetId = person.id;
      proposePartnerNameEl.textContent = person.fullname;
      document.getElementById('propose-subject-input').value = '';
      document.getElementById('propose-topic-input').value = '';
      document.getElementById('propose-note-input').value = '';
      selectedLevel = '';
      levelButtons.forEach((b) => b.classList.remove('selected'));
      selectedCount = 5;
      countButtons.forEach((b) => b.classList.toggle('selected', Number(b.dataset.count) === selectedCount));
      proposeStatusEl.textContent = '';
      proposeForm.hidden = false;
    });
  });

  document.getElementById('propose-cancel-btn').addEventListener('click', () => {
    proposeForm.hidden = true;
  });

  document.getElementById('propose-send-btn').addEventListener('click', () => {
    const subject = document.getElementById('propose-subject-input').value.trim();
    const topic = document.getElementById('propose-topic-input').value.trim();
    if (!subject || !topic) {
      proposeStatusEl.textContent = 'A subject and topic are required.';
      return;
    }
    const targetName = proposePartnerNameEl.textContent;
    const note = document.getElementById('propose-note-input').value.trim();
    const params = new URLSearchParams({
      opponentId: String(proposeTargetId), opponentName: targetName, subject, topic, level: selectedLevel, count: String(selectedCount), note,
    });
    window.location.href = 'challenge-quiz.html?' + params.toString();
  });

  // Skips taking it yourself first - a real quiz is still generated (see
  // routes/challenges.py's send_challenge), just with no challenger score
  // to compare against, only a real one waiting for them.
  document.getElementById('propose-send-direct-btn').addEventListener('click', () => {
    const subject = document.getElementById('propose-subject-input').value.trim();
    const topic = document.getElementById('propose-topic-input').value.trim();
    if (!subject || !topic) {
      proposeStatusEl.textContent = 'A subject and topic are required.';
      return;
    }
    const note = document.getElementById('propose-note-input').value.trim();
    const sendBtn = document.getElementById('propose-send-direct-btn');
    sendBtn.disabled = true;
    proposeStatusEl.textContent = 'Sending...';
    apiFetch('/challenges', {
      method: 'POST',
      body: JSON.stringify({
        challengedId: proposeTargetId, subject, topic, level: selectedLevel, count: selectedCount, note,
      }),
    })
      .then(() => {
        proposeForm.hidden = true;
        window.location.reload();
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        sendBtn.disabled = false;
        proposeStatusEl.textContent = error.message;
      });
  });

});
