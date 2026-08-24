document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // The question bank: 5 questions per topic.
  // ---------------------------------------------------------------
  // Each question is an object with the question text, 4 possible
  // answers, and "correct" - the INDEX (0-3) of the right one in the
  // options array. Keeping the answer as an index (not the text itself)
  // makes checking it later a simple, exact comparison.
  const quizBank = {
    'Calculus': [
      { q: 'What is the derivative of x²?', options: ['x', '2x', 'x²', '2'], correct: 1 },
      { q: "What does 'dy/dx' represent?", options: ['The area under a curve', 'The rate of change of y with respect to x', 'The maximum value of y', 'A constant'], correct: 1 },
      { q: 'What is the integral of a constant, like ∫5 dx?', options: ['5', '5x + C', 'x + C', '0'], correct: 1 },
      { q: 'What is the derivative of any constant?', options: ['0', '1', 'The constant itself', 'Undefined'], correct: 0 },
      { q: 'What is the limit of (sin x)/x as x approaches 0?', options: ['0', 'Infinity', '1', 'Undefined'], correct: 2 },
    ],
    'Algebra II': [
      { q: 'What is the standard form of a quadratic equation?', options: ['ax + b = 0', 'ax² + bx + c = 0', 'a/x = b', 'ax³ + b = 0'], correct: 1 },
      { q: 'At most, how many solutions can a quadratic equation have?', options: ['1', '2', '3', '4'], correct: 1 },
      { q: 'What is the formula for the discriminant?', options: ['b² - 4ac', 'b² + 4ac', '4ac - b²', '-b/2a'], correct: 0 },
      { q: 'What does a negative discriminant tell you?', options: ['Two real solutions', 'One real solution', 'No real solutions', 'Infinite solutions'], correct: 2 },
      { q: 'A logarithm is the inverse of which operation?', options: ['Addition', 'Multiplication', 'Exponentiation', 'Division'], correct: 2 },
    ],
    'Web Development': [
      { q: 'What does HTML stand for?', options: ['HyperText Markup Language', 'High-Level Text Machine Language', 'HyperText Management Log', 'Home Tool Markup Language'], correct: 0 },
      { q: 'What does CSS mainly control on a webpage?', options: ['Server logic', 'Styling and layout', 'Database queries', 'User authentication'], correct: 1 },
      { q: 'Which language adds interactivity to a webpage?', options: ['HTML', 'CSS', 'JavaScript', 'XML'], correct: 2 },
      { q: 'Which HTML tag links an external CSS file?', options: ['<style>', '<script>', '<css>', '<link>'], correct: 3 },
      { q: "What does 'responsive design' mean?", options: ['The page loads fast', 'The layout adapts to different screen sizes', 'The site uses a database', 'The page has animations'], correct: 1 },
    ],
    'Data Structures': [
      { q: 'Which data structure works on a First-In-First-Out (FIFO) basis?', options: ['Stack', 'Queue', 'Tree', 'Graph'], correct: 1 },
      { q: 'Which data structure works on a Last-In-First-Out (LIFO) basis?', options: ['Queue', 'Linked List', 'Stack', 'Array'], correct: 2 },
      { q: 'What is the typical time complexity of searching a balanced binary search tree?', options: ['O(1)', 'O(n)', 'O(log n)', 'O(n²)'], correct: 2 },
      { q: 'Which data structure stores data as key-value pairs?', options: ['Array', 'Hash map', 'Stack', 'Queue'], correct: 1 },
      { q: 'What connects the nodes in a linked list?', options: ['Indexes', 'Pointers/references', 'Keys', 'Weights'], correct: 1 },
    ],
    'World History': [
      { q: 'In which year did World War II end?', options: ['1939', '1942', '1945', '1950'], correct: 2 },
      { q: 'Which ancient civilization built the pyramids of Giza?', options: ['Romans', 'Egyptians', 'Greeks', 'Mayans'], correct: 1 },
      { q: 'The Renaissance began in which country?', options: ['France', 'Spain', 'Italy', 'England'], correct: 2 },
      { q: 'Who was the first President of the United States?', options: ['Thomas Jefferson', 'Abraham Lincoln', 'John Adams', 'George Washington'], correct: 3 },
      { q: 'Julius Caesar ruled which empire?', options: ['Ottoman Empire', 'Roman Empire', 'Persian Empire', 'Byzantine Empire'], correct: 1 },
    ],
    'Spanish': [
      { q: "How do you say 'hello' in Spanish?", options: ['Adiós', 'Hola', 'Gracias', 'Bien'], correct: 1 },
      { q: "What does 'gracias' mean?", options: ['Please', 'Sorry', 'Thank you', 'Goodbye'], correct: 2 },
      { q: "How do you say 'goodbye' in Spanish?", options: ['Hola', 'Por favor', 'Adiós', 'Buenos días'], correct: 2 },
      { q: "What is the Spanish word for 'water'?", options: ['Agua', 'Pan', 'Leche', 'Fuego'], correct: 0 },
      { q: "How do you ask 'How are you?' in Spanish?", options: ['¿Cómo te llamas?', '¿Cómo estás?', '¿Dónde estás?', '¿Qué hora es?'], correct: 1 },
    ],
    'Biology 101': [
      { q: 'What is the basic unit of life?', options: ['The organ', 'The cell', 'The tissue', 'The molecule'], correct: 1 },
      { q: "Which organelle is known as the 'powerhouse of the cell'?", options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi apparatus'], correct: 2 },
      { q: 'Which molecule carries genetic information?', options: ['RNA only', 'DNA', 'Protein', 'ATP'], correct: 1 },
      { q: 'What process do plants use to make food from sunlight?', options: ['Respiration', 'Fermentation', 'Photosynthesis', 'Digestion'], correct: 2 },
      { q: 'What is the process by which a cell divides into two identical cells?', options: ['Meiosis', 'Mitosis', 'Osmosis', 'Diffusion'], correct: 1 },
    ],
    'Organic Chemistry': [
      { q: 'What element forms the backbone of all organic compounds?', options: ['Oxygen', 'Carbon', 'Nitrogen', 'Hydrogen'], correct: 1 },
      { q: 'What is the simplest organic compound, with just 1 carbon atom?', options: ['Ethane', 'Methane', 'Propane', 'Butane'], correct: 1 },
      { q: 'Which functional group is found in alcohols?', options: ['-COOH', '-OH', '-NH2', '-CHO'], correct: 1 },
      { q: 'What type of bond do carbon atoms typically form with each other?', options: ['Ionic', 'Metallic', 'Covalent', 'Hydrogen'], correct: 2 },
      { q: 'What term describes compounds made of only carbon and hydrogen?', options: ['Carbohydrates', 'Hydrocarbons', 'Alcohols', 'Esters'], correct: 1 },
    ],
    'Creative Writing': [
      { q: 'What is the term for the main character in a story?', options: ['Antagonist', 'Narrator', 'Protagonist', 'Author'], correct: 2 },
      { q: "'Show, don't tell' is a principle of what?", options: ['Grammar rules', 'Vivid, descriptive writing', 'Spelling accuracy', 'Publishing'], correct: 1 },
      { q: 'What term describes the turning point of a story?', options: ['Exposition', 'Climax', 'Resolution', 'Prologue'], correct: 1 },
      { q: "What is a story told from the 'I' perspective called?", options: ['Third person', 'Second person', 'First person', 'Omniscient'], correct: 2 },
      { q: 'What term describes the mood or atmosphere of a piece of writing?', options: ['Plot', 'Setting', 'Tone', 'Theme'], correct: 2 },
    ],
    'Public Speaking': [
      { q: 'What is the fear of public speaking called?', options: ['Claustrophobia', 'Glossophobia', 'Acrophobia', 'Arachnophobia'], correct: 1 },
      { q: 'A good speech typically has three of what?', options: ['Jokes', 'Parts (intro, body, conclusion)', 'Slides', 'Pauses'], correct: 1 },
      { q: 'What technique commonly helps calm nerves before speaking?', options: ['Speaking faster', 'Deep breathing and practice', 'Avoiding eye contact', 'Memorizing word-for-word'], correct: 1 },
      { q: 'What is it called when a speaker uses gestures and movement?', options: ['Vocal variety', 'Body language', 'Pacing', 'Diction'], correct: 1 },
      { q: 'What is the main purpose of eye contact during a speech?', options: ['To read notes better', 'To engage and connect with the audience', 'To find the exit', 'To time the speech'], correct: 1 },
    ],
  };

  // ---------------------------------------------------------------
  // Read subject/topic/level from the URL - teach-subject.js sends
  // these the same way choose-subject.js sends them to connecting.html.
  // ---------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const subject = params.get('subject') || '';
  const topic = params.get('topic') || '';
  const level = params.get('level') || '';

  // Looks up a topic in quizBank without requiring a perfect match -
  // typing "algebra" or "Algebra" should still find "Algebra II", since
  // the Topic field on the previous screen allows free typing.
  function findQuestions(typedTopic) {
    const normalized = typedTopic.trim().toLowerCase();
    if (!normalized) return null;

    const bankKeys = Object.keys(quizBank);

    // 1) Exact match, ignoring capitalization ("algebra ii" = "Algebra II")
    const exactKey = bankKeys.find((key) => key.toLowerCase() === normalized);
    if (exactKey) return quizBank[exactKey];

    // 2) Partial match, either direction - covers "Algebra" matching
    //    "Algebra II", or someone typing extra words around a real topic.
    const partialKey = bankKeys.find(
      (key) => key.toLowerCase().includes(normalized) || normalized.includes(key.toLowerCase())
    );
    return partialKey ? quizBank[partialKey] : null;
  }

  const questions = findQuestions(topic);

  const quizView = document.getElementById('quiz-view');
  const noQuizView = document.getElementById('no-quiz-view');
  const resultView = document.getElementById('result-view');

  // If we don't have questions for this exact topic (e.g. it was
  // free-typed on the previous screen), skip straight to a friendly
  // message instead of showing broken/empty questions.
  if (!questions) {
    quizView.hidden = true;
    noQuizView.hidden = false;

    document.getElementById('skip-btn').addEventListener('click', () => {
      goToConnecting();
    });
    return; // nothing below this point applies, so stop here
  }

  document.getElementById('quiz-topic-title').textContent = topic + ' Quiz';

  // ---------------------------------------------------------------
  // Quiz state
  // ---------------------------------------------------------------
  let currentIndex = 0;
  // One array slot per question, holding which option index the user
  // picked - starts as all "null" (unanswered).
  const selectedAnswers = new Array(questions.length).fill(null);

  const counterEl = document.getElementById('question-counter');
  const questionTextEl = document.getElementById('question-text');
  const optionsListEl = document.getElementById('options-list');
  const errorEl = document.getElementById('quiz-error');
  const saveNextBtn = document.getElementById('save-next-btn');
  const backBtn = document.getElementById('back-q-btn');
  const nextBtn = document.getElementById('next-q-btn');

  const letters = ['A', 'B', 'C', 'D'];

  // Draws the current question and its options onto the page. Called
  // every time currentIndex changes, so the page always matches the state.
  function renderQuestion() {
    const question = questions[currentIndex];

    counterEl.textContent = (currentIndex + 1) + '/' + questions.length;
    questionTextEl.textContent = question.q;
    errorEl.hidden = true;

    optionsListEl.innerHTML = '';
    question.options.forEach((optionText, optionIndex) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'option-btn';
      if (selectedAnswers[currentIndex] === optionIndex) {
        button.classList.add('selected');
      }
      button.innerHTML =
        '<span class="option-letter">' + letters[optionIndex] + '</span>' +
        '<span class="option-text">' + optionText + '</span>' +
        '<span class="option-radio"></span>';

      button.addEventListener('click', () => {
        selectedAnswers[currentIndex] = optionIndex;
        renderQuestion(); // re-draw so the "selected" highlight updates
      });

      optionsListEl.appendChild(button);
    });

    const isLastQuestion = currentIndex === questions.length - 1;
    saveNextBtn.textContent = isLastQuestion ? 'Save & Finish' : 'Save & Next';
    backBtn.disabled = currentIndex === 0;
    nextBtn.disabled = isLastQuestion;
  }

  // ---------------------------------------------------------------
  // "Save & Next" - requires an answer, then advances (or finishes)
  // ---------------------------------------------------------------
  saveNextBtn.addEventListener('click', () => {
    if (selectedAnswers[currentIndex] === null) {
      errorEl.textContent = 'Please select an answer to continue.';
      errorEl.hidden = false;
      return;
    }

    if (currentIndex < questions.length - 1) {
      currentIndex++;
      renderQuestion();
    } else {
      finishQuiz();
    }
  });

  // ---------------------------------------------------------------
  // "Back" / "Next" - free navigation, no answer required
  // ---------------------------------------------------------------
  backBtn.addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderQuestion();
    }
  });
  nextBtn.addEventListener('click', () => {
    if (currentIndex < questions.length - 1) {
      currentIndex++;
      renderQuestion();
    }
  });

  // ---------------------------------------------------------------
  // "Submit" - ends the quiz early using whatever's answered so far
  // ---------------------------------------------------------------
  document.getElementById('submit-btn').addEventListener('click', finishQuiz);

  function finishQuiz() {
    // Count how many selected answers match their question's "correct" index.
    // reduce() walks through the array once, building up a single total.
    const score = selectedAnswers.reduce((total, answer, index) => {
      return answer === questions[index].correct ? total + 1 : total;
    }, 0);

    quizView.hidden = true;
    resultView.hidden = false;

    document.getElementById('result-score').textContent = `You scored ${score}/${questions.length}`;

    const continueBtn = document.getElementById('continue-btn');
    const isPerfect = score === questions.length;

    if (isPerfect) {
      document.getElementById('result-message').textContent = "Perfect! You've mastered this topic.";
      continueBtn.textContent = 'Continue';
      // Using .onclick (instead of addEventListener) means setting it
      // again always REPLACES the previous handler rather than stacking
      // a second one - handy here since finishQuiz() could technically
      // run more than once (e.g. if someone were able to submit twice).
      continueBtn.onclick = () => {
        const params = new URLSearchParams({ subject, topic, level });
        window.location.href = 'teaching-tips.html?' + params.toString();
      };
    } else {
      document.getElementById('result-message').textContent = "Almost there! Let's strengthen your understanding and try again.";
      continueBtn.textContent = 'Back to Home';
      continueBtn.onclick = () => {
        window.location.href = 'home.html';
      };
    }
  }

  renderQuestion();

  // ---------------------------------------------------------------
  // Shared by both the "no quiz available" and result views: continue
  // on to the same matching screen the "learn" flow uses.
  // ---------------------------------------------------------------
  function goToConnecting() {
    const connectParams = new URLSearchParams({ subject, topic, level });
    window.location.href = 'connecting.html?' + connectParams.toString();
  }

});
