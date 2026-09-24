document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const params = new URLSearchParams(window.location.search);
  // Two ways to reach this screen: proposing a NEW challenge (opponentId +
  // subject/topic given directly), or PLAYING one you were challenged to
  // (challengeId only - the real questions come from the backend, locked
  // to whatever the challenger actually took, see QuizChallenge.questions).
  const opponentId = params.get('opponentId');
  const opponentName = params.get('opponentName') || '';
  const subject = params.get('subject') || '';
  const topic = params.get('topic') || '';
  const level = params.get('level') || '';
  const note = params.get('note') || '';
  const count = Number(params.get('count')) || 5;
  const challengeId = params.get('challengeId');

  const loadingView = document.getElementById('loading-view');
  const quizView = document.getElementById('quiz-view');
  const resultView = document.getElementById('result-view');
  const loadingText = document.getElementById('loading-text');
  const loadingSpinner = document.getElementById('loading-spinner');
  const retryBtn = document.getElementById('retry-btn');
  const kickerText = document.getElementById('kicker-text');

  // The AI quiz call can fail for a genuinely temporary reason (Gemini
  // briefly overloaded, a network hiccup) - before this, the only way
  // out of that was Back, losing the "challenge this person" context
  // entirely. Shows the same "Try again" affordance either loading path
  // can use, instead of two separate error states.
  function showLoadError(message) {
    loadingSpinner.hidden = true;
    loadingText.textContent = message;
    retryBtn.hidden = false;
  }

  let questions = [];
  let isChallenger = !challengeId;

  document.getElementById('back-btn').addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'home.html';
    }
  });

  // Warn before leaving mid-quiz - same reasoning as quiz.js's own
  // version (discourages, doesn't pretend to prevent, looking up an
  // answer in another tab). Armed only while real questions are on
  // screen, disarmed the moment it's actually submitted.
  let quizInProgress = false;
  window.addEventListener('beforeunload', (event) => {
    if (!quizInProgress) return;
    event.preventDefault();
    event.returnValue = '';
  });

  function renderQuiz() {
    document.getElementById('quiz-title').textContent = topic + ' Quiz';
    quizInProgress = true;
    const listEl = document.getElementById('question-list');
    listEl.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];

    questions.forEach((question, qIndex) => {
      const block = document.createElement('div');
      block.className = 'question-block';
      const qText = document.createElement('p');
      qText.className = 'question-block-text';
      qText.textContent = `${qIndex + 1}. ${question.q}`;
      block.appendChild(qText);

      const optionsWrap = document.createElement('div');
      optionsWrap.className = 'question-options';
      question.options.forEach((optionText, optIndex) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mini-option-btn';
        btn.dataset.question = qIndex;
        btn.dataset.option = optIndex;
        btn.innerHTML = `<span class="mini-option-letter">${letters[optIndex]}</span><span>${optionText}</span>`;
        btn.addEventListener('click', () => {
          optionsWrap.querySelectorAll('.mini-option-btn').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
          block.dataset.selected = optIndex;
        });
        optionsWrap.appendChild(btn);
      });
      block.appendChild(optionsWrap);
      listEl.appendChild(block);
    });

    quizView.hidden = false;
  }

  document.getElementById('submit-quiz-btn').addEventListener('click', () => {
    const blocks = document.querySelectorAll('.question-block');
    const answers = Array.from(blocks).map((b) => (b.dataset.selected !== undefined ? Number(b.dataset.selected) : null));
    if (answers.some((a) => a === null)) {
      document.getElementById('quiz-error').hidden = false;
      return;
    }
    const score = answers.reduce((total, answer, i) => (answer === questions[i].correct ? total + 1 : total), 0);
    quizView.hidden = true;
    quizInProgress = false; // submitted for real now - leaving from here on is fine

    if (isChallenger) {
      apiFetch('/challenges', {
        method: 'POST',
        body: JSON.stringify({
          challengedId: Number(opponentId),
          subject, topic, level,
          questions,
          score,
          note,
        }),
      })
        .then(() => {
          document.getElementById('result-score').textContent = `You scored ${score}/${questions.length}`;
          document.getElementById('result-message').textContent = `Challenge sent to ${opponentName}!`;
          resultView.hidden = false;
        })
        .catch((error) => alert(error.message));
    } else {
      apiFetch(`/challenges/${challengeId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ score }),
      })
        .then((data) => {
          const c = data.challenge;
          document.getElementById('result-score').textContent = `You scored ${score}/${questions.length}`;
          const verdict = score === c.challengerScore ? "It's a tie!" : score > c.challengerScore ? 'You won!' : `${c.challengerName} won this one.`;
          document.getElementById('result-message').textContent = `${c.challengerName} scored ${c.challengerScore}/${c.totalQuestions}. ${verdict}`;
          resultView.hidden = false;
        })
        .catch((error) => alert(error.message));
    }
  });

  document.getElementById('continue-btn').addEventListener('click', () => {
    window.location.href = 'challenges.html';
  });

  function startLoading() {
    loadingSpinner.hidden = false;
    retryBtn.hidden = true;
    loadingText.textContent = 'Loading the quiz...';
  }

  function loadExistingChallenge() {
    // Playing a real challenge someone sent - the exact frozen question
    // set, not a fresh generation (see QuizChallenge.questions).
    kickerText.textContent = 'Quiz Challenge';
    startLoading();
    apiFetch(`/challenges/${challengeId}/play`)
      .then((data) => {
        const c = data.challenge;
        questions = c.questions;
        document.title = c.topic + ' Quiz Challenge';
        loadingView.hidden = true;
        renderQuiz();
        const noteEl = document.getElementById('challenge-note');
        if (c.note) {
          noteEl.textContent = `💬 ${c.challengerName}: "${c.note}"`;
          noteEl.hidden = false;
        }
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        showLoadError("Couldn't load this challenge: " + error.message);
      });
  }

  function loadNewChallenge() {
    // Proposing a NEW challenge - generate a real quiz first (same backend
    // path quiz.js uses), take it, then send the result + exact questions.
    startLoading();
    apiFetch('/quiz/generate', {
      method: 'POST',
      body: JSON.stringify({ subject, topic, level, count }),
    })
      .then((data) => {
        if (!data.available || !data.questions?.length) {
          showLoadError("Couldn't generate a quiz for that topic right now.");
          return;
        }
        questions = data.questions;
        loadingView.hidden = true;
        renderQuiz();
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        showLoadError("Couldn't generate a quiz: " + error.message);
      });
  }

  if (challengeId) {
    retryBtn.addEventListener('click', loadExistingChallenge);
    loadExistingChallenge();
  } else if (opponentId && subject && topic) {
    retryBtn.addEventListener('click', loadNewChallenge);
    loadNewChallenge();
  } else {
    window.location.href = 'challenges.html';
  }

});
