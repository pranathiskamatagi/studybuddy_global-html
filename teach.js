/* ================= SCREEN NAVIGATION ================= */
let current = 0;
const totalScreens = 6;

function goToScreen(i){
  document.getElementById('screen-'+current).classList.remove('active');
  current = i;
  document.getElementById('screen-'+current).classList.add('active');
  window.scrollTo({top:0, behavior:'smooth'});

  if(current === 5){
    setTimeout(()=>{ document.getElementById('xpFill').style.width = '78%'; }, 300);
  }
}

function prevScreen(){
  if(current > 0){ goToScreen(current-1); }
}

/* ================= QUIZ DATA ================= */
const quizQuestions = [
  {
    question: "What is the standard form of a quadratic equation?",
    options: [
      { text:"ax² + bx + c = 0", correct:true },
      { text:"ax + b = 0", correct:false },
      { text:"a/x + b = c", correct:false },
      { text:"ax³ + bx = 0", correct:false }
    ]
  },
  {
    question: "To solve 2x + 6 = 14, what's the first step?",
    options: [
      { text:"Divide both sides by 2", correct:false },
      { text:"Subtract 6 from both sides", correct:true },
      { text:"Add 6 to both sides", correct:false },
      { text:"Multiply both sides by 2", correct:false }
    ]
  },
  {
    question: "In factoring, what must the two numbers do for x² + 7x + 12?",
    options: [
      { text:"Multiply to 12 and add to 7", correct:true },
      { text:"Add to 12 and multiply to 7", correct:false },
      { text:"Multiply to 7 and add to 12", correct:false },
      { text:"Subtract to give 12", correct:false }
    ]
  }
];

let quizIndex = 0;
let quizScore = 0;
let questionFailed = false;

function loadQuestion(i){
  const q = quizQuestions[i];
  document.getElementById('quizQuestion').innerText = q.question;
  document.getElementById('quizProgressLabel').innerText = `Question ${i+1} of ${quizQuestions.length}`;
  document.getElementById('quizScoreLabel').innerText = `Score: ${quizScore}/${quizQuestions.length}`;

  const optionsWrap = document.getElementById('quizOptions');
  optionsWrap.innerHTML = '';
  q.options.forEach(opt=>{
    const div = document.createElement('div');
    div.className = 'quiz-option';
    div.dataset.correct = opt.correct;
    div.innerText = opt.text;
    div.onclick = ()=> selectOption(div, opt.correct);
    optionsWrap.appendChild(div);
  });

  const feedback = document.getElementById('quizFeedback');
  feedback.className = 'quiz-feedback';
  feedback.innerText = '';

  document.getElementById('quizNextBtn').disabled = true;
  questionFailed = false;
}

function selectOption(el, isCorrect){
  const allOptions = document.querySelectorAll('.quiz-option');
  allOptions.forEach(o=> o.classList.add('disabled'));

  const feedback = document.getElementById('quizFeedback');

  if(isCorrect){
    el.classList.add('correct');
    quizScore++;
    document.getElementById('quizScoreLabel').innerText = `Score: ${quizScore}/${quizQuestions.length}`;
    feedback.className = 'quiz-feedback show correct';
    feedback.innerText = "Correct! Nice work 🎉";
  } else {
    el.classList.add('wrong');
    allOptions.forEach(o=>{
      if(o.dataset.correct === 'true') o.classList.add('correct');
    });
    feedback.className = 'quiz-feedback show wrong';
    feedback.innerText = "Not quite — you'll need to review this concept before retrying.";
    questionFailed = true;
  }

  document.getElementById('quizNextBtn').disabled = false;
}

function nextQuizQuestion(){
  // If the current question was answered wrong, send back to Learn Topic instead of continuing
  if(questionFailed){
    sendBackToLearnTopic();
    return;
  }

  quizIndex++;

  if(quizIndex >= quizQuestions.length){
    // All questions passed
    goToScreen(2);
    resetQuiz();
    return;
  }

  loadQuestion(quizIndex);
}

function sendBackToLearnTopic(){
  resetQuiz();
  goToScreen(0);

  const ctaCard = document.getElementById('quizCtaCard');
  const ctaText = document.getElementById('quizCtaText');
  ctaCard.classList.add('warning');
  ctaText.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>&nbsp; Let\'s review this again before retrying the quiz';
}

function resetQuiz(){
  quizIndex = 0;
  quizScore = 0;
  questionFailed = false;
  loadQuestion(0);
}

// Initialize first question on load
document.addEventListener('DOMContentLoaded', ()=>{
  loadQuestion(0);
});

/* ================= LIVE CHAT (teaching session) ================= */
function sendMessage(){
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if(!text) return;

  const chatWindow = document.getElementById('chatWindow');
  const typing = chatWindow.querySelector('.typing-indicator');

  const row = document.createElement('div');
  row.className = 'msg-row me';
  row.innerHTML = `
    <div class="msg-avatar">You</div>
    <div>
      <div class="msg-bubble">${text}</div>
    </div>
  `;
  chatWindow.insertBefore(row, typing);
  input.value = '';
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

document.addEventListener('DOMContentLoaded', ()=>{
  const input = document.getElementById('chatInput');
  if(input){
    input.addEventListener('keypress', (e)=>{
      if(e.key === 'Enter') sendMessage();
    });
  }
});

function goHome(){
  alert('Redirecting to Home screen (connect this to your Home page navigation).');
}