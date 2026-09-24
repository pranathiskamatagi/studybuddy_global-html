document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // The question bank: a POOL of questions per topic, more than any one
  // attempt shows.
  // ---------------------------------------------------------------
  // Each question is an object with the question text, 4 possible
  // answers, and "correct" - the INDEX (0-3) of the right one in the
  // options array. Keeping the answer as an index (not the text itself)
  // makes checking it later a simple, exact comparison.
  // Each topic has MORE than 5 questions on purpose - QUESTIONS_PER_ATTEMPT
  // below picks a random 5 of them (in a random order) every time someone
  // starts this quiz, so retaking it (or a friend taking it later) doesn't
  // just show the exact same 5 questions every single time. This is the
  // FREE/INSTANT path - no AI call, no quota cost - unlike a topic outside
  // this bank, which goes to quiz_generator.py's real Gemini generation
  // instead (rotated the same way, just capped to a few AI calls per topic
  // rather than a random pick from a big local pool - see that file).
  const quizBank = {
    'Calculus': [
      { q: 'What is the derivative of x²?', options: ['x', '2x', 'x²', '2'], correct: 1 },
      { q: "What does 'dy/dx' represent?", options: ['The area under a curve', 'The rate of change of y with respect to x', 'The maximum value of y', 'A constant'], correct: 1 },
      { q: 'What is the integral of a constant, like ∫5 dx?', options: ['5', '5x + C', 'x + C', '0'], correct: 1 },
      { q: 'What is the derivative of any constant?', options: ['0', '1', 'The constant itself', 'Undefined'], correct: 0 },
      { q: 'What is the limit of (sin x)/x as x approaches 0?', options: ['0', 'Infinity', '1', 'Undefined'], correct: 2 },
      { q: 'What is the derivative of sin(x)?', options: ['cos(x)', '-cos(x)', '-sin(x)', 'tan(x)'], correct: 0 },
      { q: 'What does the second derivative of a function tell you?', options: ['Its slope', 'Its concavity', 'Its maximum value', 'Its domain'], correct: 1 },
      { q: 'What is the derivative of eˣ?', options: ['xeˣ⁻¹', 'eˣ', 'ln(x)', '1/x'], correct: 1 },
      { q: 'The Fundamental Theorem of Calculus connects which two operations?', options: ['Addition and subtraction', 'Differentiation and integration', 'Multiplication and division', 'Limits and continuity'], correct: 1 },
    ],
    'Algebra II': [
      { q: 'What is the standard form of a quadratic equation?', options: ['ax + b = 0', 'ax² + bx + c = 0', 'a/x = b', 'ax³ + b = 0'], correct: 1 },
      { q: 'At most, how many solutions can a quadratic equation have?', options: ['1', '2', '3', '4'], correct: 1 },
      { q: 'What is the formula for the discriminant?', options: ['b² - 4ac', 'b² + 4ac', '4ac - b²', '-b/2a'], correct: 0 },
      { q: 'What does a negative discriminant tell you?', options: ['Two real solutions', 'One real solution', 'No real solutions', 'Infinite solutions'], correct: 2 },
      { q: 'A logarithm is the inverse of which operation?', options: ['Addition', 'Multiplication', 'Exponentiation', 'Division'], correct: 2 },
      { q: 'What is the vertex form of a quadratic equation?', options: ['y = ax² + bx + c', 'y = a(x - h)² + k', 'y = mx + b', 'y = a/x'], correct: 1 },
      { q: 'What is log₁₀(100)?', options: ['1', '2', '10', '100'], correct: 1 },
      { q: 'What is a function\'s domain?', options: ['All possible output values', 'All possible input values', 'Its highest point', 'Its slope'], correct: 1 },
      { q: 'What shape does the graph of a quadratic function make?', options: ['A straight line', 'A circle', 'A parabola', 'A hyperbola'], correct: 2 },
    ],
    'Web Development': [
      { q: 'What does HTML stand for?', options: ['HyperText Markup Language', 'High-Level Text Machine Language', 'HyperText Management Log', 'Home Tool Markup Language'], correct: 0 },
      { q: 'What does CSS mainly control on a webpage?', options: ['Server logic', 'Styling and layout', 'Database queries', 'User authentication'], correct: 1 },
      { q: 'Which language adds interactivity to a webpage?', options: ['HTML', 'CSS', 'JavaScript', 'XML'], correct: 2 },
      { q: 'Which HTML tag links an external CSS file?', options: ['<style>', '<script>', '<css>', '<link>'], correct: 3 },
      { q: "What does 'responsive design' mean?", options: ['The page loads fast', 'The layout adapts to different screen sizes', 'The site uses a database', 'The page has animations'], correct: 1 },
      { q: 'What does API stand for?', options: ['Application Programming Interface', 'Automated Page Index', 'Applied Program Instruction', 'Application Process Integration'], correct: 0 },
      { q: 'What does the DOM represent?', options: ['A database schema', 'The structure of a webpage as objects', 'A server configuration', 'A styling framework'], correct: 1 },
      { q: 'Which HTTP method is typically used to submit new data?', options: ['GET', 'POST', 'DELETE', 'HEAD'], correct: 1 },
      { q: "What's the purpose of a CSS class selector (e.g. .card)?", options: ['Select one element by its unique id', 'Select every element sharing that class', 'Select the whole page', 'Select only links'], correct: 1 },
    ],
    'Data Structures': [
      { q: 'Which data structure works on a First-In-First-Out (FIFO) basis?', options: ['Stack', 'Queue', 'Tree', 'Graph'], correct: 1 },
      { q: 'Which data structure works on a Last-In-First-Out (LIFO) basis?', options: ['Queue', 'Linked List', 'Stack', 'Array'], correct: 2 },
      { q: 'What is the typical time complexity of searching a balanced binary search tree?', options: ['O(1)', 'O(n)', 'O(log n)', 'O(n²)'], correct: 2 },
      { q: 'Which data structure stores data as key-value pairs?', options: ['Array', 'Hash map', 'Stack', 'Queue'], correct: 1 },
      { q: 'What connects the nodes in a linked list?', options: ['Indexes', 'Pointers/references', 'Keys', 'Weights'], correct: 1 },
      { q: 'What is the time complexity of accessing an array element by index?', options: ['O(1)', 'O(n)', 'O(log n)', 'O(n²)'], correct: 0 },
      { q: 'Which structure is used to implement recursion under the hood?', options: ['Queue', 'Stack', 'Hash map', 'Graph'], correct: 1 },
      { q: 'What is a binary tree where every level is fully filled called?', options: ['A linked list', 'A complete/perfect tree', 'A hash table', 'A queue'], correct: 1 },
      { q: 'What does a graph\'s "edge" represent?', options: ['A single data value', 'A connection between two nodes', 'The root node', 'An empty slot'], correct: 1 },
    ],
    'World History': [
      { q: 'In which year did World War II end?', options: ['1939', '1942', '1945', '1950'], correct: 2 },
      { q: 'Which ancient civilization built the pyramids of Giza?', options: ['Romans', 'Egyptians', 'Greeks', 'Mayans'], correct: 1 },
      { q: 'The Renaissance began in which country?', options: ['France', 'Spain', 'Italy', 'England'], correct: 2 },
      { q: 'Who was the first President of the United States?', options: ['Thomas Jefferson', 'Abraham Lincoln', 'John Adams', 'George Washington'], correct: 3 },
      { q: 'Julius Caesar ruled which empire?', options: ['Ottoman Empire', 'Roman Empire', 'Persian Empire', 'Byzantine Empire'], correct: 1 },
      { q: 'The Cold War was primarily between the US and which country?', options: ['China', 'Soviet Union', 'Germany', 'Japan'], correct: 1 },
      { q: 'Which event is often cited as starting World War I?', options: ['The bombing of Pearl Harbor', 'The assassination of Archduke Franz Ferdinand', 'The fall of the Berlin Wall', 'The French Revolution'], correct: 1 },
      { q: 'The Great Wall was built primarily to defend which country?', options: ['India', 'China', 'Japan', 'Mongolia'], correct: 1 },
      { q: 'Who led India\'s independence movement through nonviolent resistance?', options: ['Nelson Mandela', 'Mahatma Gandhi', 'Winston Churchill', 'Jawaharlal Nehru'], correct: 1 },
    ],
    'Spanish': [
      { q: "How do you say 'hello' in Spanish?", options: ['Adiós', 'Hola', 'Gracias', 'Bien'], correct: 1 },
      { q: "What does 'gracias' mean?", options: ['Please', 'Sorry', 'Thank you', 'Goodbye'], correct: 2 },
      { q: "How do you say 'goodbye' in Spanish?", options: ['Hola', 'Por favor', 'Adiós', 'Buenos días'], correct: 2 },
      { q: "What is the Spanish word for 'water'?", options: ['Agua', 'Pan', 'Leche', 'Fuego'], correct: 0 },
      { q: "How do you ask 'How are you?' in Spanish?", options: ['¿Cómo te llamas?', '¿Cómo estás?', '¿Dónde estás?', '¿Qué hora es?'], correct: 1 },
      { q: "What does 'por favor' mean?", options: ['Thank you', 'You\'re welcome', 'Please', 'Excuse me'], correct: 2 },
      { q: "What is the Spanish word for 'friend' (male)?", options: ['Amiga', 'Amigo', 'Hermano', 'Señor'], correct: 1 },
      { q: "How do you say 'my name is...' in Spanish?", options: ['Me llamo...', 'Tengo...', 'Soy de...', 'Vivo en...'], correct: 0 },
      { q: "What does 'buenos días' mean?", options: ['Good night', 'Good afternoon', 'Good morning', 'See you later'], correct: 2 },
    ],
    'Biology 101': [
      { q: 'What is the basic unit of life?', options: ['The organ', 'The cell', 'The tissue', 'The molecule'], correct: 1 },
      { q: "Which organelle is known as the 'powerhouse of the cell'?", options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi apparatus'], correct: 2 },
      { q: 'Which molecule carries genetic information?', options: ['RNA only', 'DNA', 'Protein', 'ATP'], correct: 1 },
      { q: 'What process do plants use to make food from sunlight?', options: ['Respiration', 'Fermentation', 'Photosynthesis', 'Digestion'], correct: 2 },
      { q: 'What is the process by which a cell divides into two identical cells?', options: ['Meiosis', 'Mitosis', 'Osmosis', 'Diffusion'], correct: 1 },
      { q: 'What is the function of red blood cells?', options: ['Fight infection', 'Carry oxygen', 'Clot blood', 'Digest food'], correct: 1 },
      { q: 'Which organ system includes the heart and blood vessels?', options: ['Digestive system', 'Circulatory system', 'Nervous system', 'Respiratory system'], correct: 1 },
      { q: 'What is the term for an organism\'s complete set of genetic material?', options: ['Genome', 'Enzyme', 'Chromosome pair', 'Protein chain'], correct: 0 },
      { q: 'Which kingdom do bacteria belong to?', options: ['Animalia', 'Plantae', 'Fungi', 'Monera/Bacteria'], correct: 3 },
    ],
    'Organic Chemistry': [
      { q: 'What element forms the backbone of all organic compounds?', options: ['Oxygen', 'Carbon', 'Nitrogen', 'Hydrogen'], correct: 1 },
      { q: 'What is the simplest organic compound, with just 1 carbon atom?', options: ['Ethane', 'Methane', 'Propane', 'Butane'], correct: 1 },
      { q: 'Which functional group is found in alcohols?', options: ['-COOH', '-OH', '-NH2', '-CHO'], correct: 1 },
      { q: 'What type of bond do carbon atoms typically form with each other?', options: ['Ionic', 'Metallic', 'Covalent', 'Hydrogen'], correct: 2 },
      { q: 'What term describes compounds made of only carbon and hydrogen?', options: ['Carbohydrates', 'Hydrocarbons', 'Alcohols', 'Esters'], correct: 1 },
      { q: 'Which functional group is found in carboxylic acids?', options: ['-OH', '-COOH', '-NH2', '-CHO'], correct: 1 },
      { q: 'What is an isomer?', options: ['A different element with similar properties', 'Compounds with the same formula but different structures', 'A type of chemical bond', 'A catalyst'], correct: 1 },
      { q: 'What do we call a carbon-carbon double bond compound?', options: ['Alkane', 'Alkene', 'Alkyne', 'Alcohol'], correct: 1 },
      { q: 'What is the process of breaking large hydrocarbons into smaller ones called?', options: ['Polymerization', 'Cracking', 'Distillation', 'Oxidation'], correct: 1 },
    ],
    'Creative Writing': [
      { q: 'What is the term for the main character in a story?', options: ['Antagonist', 'Narrator', 'Protagonist', 'Author'], correct: 2 },
      { q: "'Show, don't tell' is a principle of what?", options: ['Grammar rules', 'Vivid, descriptive writing', 'Spelling accuracy', 'Publishing'], correct: 1 },
      { q: 'What term describes the turning point of a story?', options: ['Exposition', 'Climax', 'Resolution', 'Prologue'], correct: 1 },
      { q: "What is a story told from the 'I' perspective called?", options: ['Third person', 'Second person', 'First person', 'Omniscient'], correct: 2 },
      { q: 'What term describes the mood or atmosphere of a piece of writing?', options: ['Plot', 'Setting', 'Tone', 'Theme'], correct: 2 },
      { q: 'What is foreshadowing?', options: ['A hint about what will happen later', 'A flashback to the past', 'The story\'s final paragraph', 'A character\'s inner thoughts'], correct: 0 },
      { q: 'What is the term for the character working against the protagonist?', options: ['Narrator', 'Antagonist', 'Sidekick', 'Foil'], correct: 1 },
      { q: 'What does "dialogue" refer to in a story?', options: ['The setting description', 'Conversation between characters', 'The title', 'The author\'s notes'], correct: 1 },
      { q: 'What is a metaphor?', options: ['A direct comparison without "like" or "as"', 'A sound effect in writing', 'A type of rhyme', 'A grammar rule'], correct: 0 },
    ],
    'Public Speaking': [
      { q: 'What is the fear of public speaking called?', options: ['Claustrophobia', 'Glossophobia', 'Acrophobia', 'Arachnophobia'], correct: 1 },
      { q: 'A good speech typically has three of what?', options: ['Jokes', 'Parts (intro, body, conclusion)', 'Slides', 'Pauses'], correct: 1 },
      { q: 'What technique commonly helps calm nerves before speaking?', options: ['Speaking faster', 'Deep breathing and practice', 'Avoiding eye contact', 'Memorizing word-for-word'], correct: 1 },
      { q: 'What is it called when a speaker uses gestures and movement?', options: ['Vocal variety', 'Body language', 'Pacing', 'Diction'], correct: 1 },
      { q: 'What is the main purpose of eye contact during a speech?', options: ['To read notes better', 'To engage and connect with the audience', 'To find the exit', 'To time the speech'], correct: 1 },
      { q: 'What is "vocal variety"?', options: ['Speaking in different languages', 'Changing your pitch, pace, and tone for emphasis', 'Using big words', 'Speaking as loudly as possible'], correct: 1 },
      { q: 'What should a strong opening line do?', options: ['List every topic you\'ll cover', 'Grab the audience\'s attention', 'Apologize for being nervous', 'Introduce yourself formally first'], correct: 1 },
      { q: 'What is a rhetorical question used for?', options: ['To get a literal answer', 'To make the audience think, not to be answered aloud', 'To fill time', 'To end a speech'], correct: 1 },
      { q: 'Why is it useful to know your audience before speaking?', options: ['So you can speak faster', 'So you can tailor your content and tone to them', 'It isn\'t actually useful', 'So you can avoid eye contact'], correct: 1 },
    ],
  };

  // How many questions a single attempt actually shows - always fewer
  // than each topic's full pool above, so which 5 (and in what order)
  // genuinely varies between attempts instead of being the exact same
  // quiz every single time.
  const QUESTIONS_PER_ATTEMPT = 5;

  // Fisher-Yates shuffle, then take the first N - picks a random subset
  // AND a random order in one pass, rather than always showing the pool
  // in the same fixed sequence.
  function pickRandomQuestions(pool, count) {
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }

  // ---------------------------------------------------------------
  // Read subject/topic/level from the URL - teach-subject.js sends
  // these the same way choose-subject.js sends them to connecting.html.
  // ---------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const subject = params.get('subject') || '';
  const topic = params.get('topic') || '';
  const level = params.get('level') || '';
  const mode = params.get('mode') || 'teach';
  // The real community request posted back on teach-subject.html - just
  // carried through so it can be withdrawn if the person cancels the
  // search later (see connecting.js).
  const requestId = params.get('requestId') || '';
  // Set only when this quiz was reached by clicking "Help" on someone
  // ELSE's real community request (home.js) instead of teach-subject.js's
  // own "I wanna teach" flow - lets connecting.html use its exact-known-
  // partner shortcut instead of a generic search, and tells us which
  // request to mark fulfilled once (and only if) the quiz is passed.
  const withName = params.get('with') || '';
  const partnerId = params.get('partnerId') || '';
  const country = params.get('country') || '';
  const fulfillRequestId = params.get('fulfillRequestId') || '';
  // Set only when fulfilling a scheduled-for-later request (connect.js) -
  // there's no live partner to search for, so fulfilling this just makes
  // a real accepted scheduled session (see requests.py's fulfill_request)
  // instead of dropping into connecting.html.
  const scheduled = params.get('scheduled') === '1';

  // ---------------------------------------------------------------
  // Warn before leaving mid-quiz - discourages the obvious way to cheat
  // (open a new tab, look up the answer, come back) without pretending
  // to actually PREVENT it (nothing client-side truly can). Only armed
  // while a real quiz is genuinely in progress - never on the picking/
  // loading screens, and turned back off the moment it's submitted, so
  // leaving afterward (to continue to teaching-tips.html, etc.) is silent.
  let quizInProgress = false;
  window.addEventListener('beforeunload', (event) => {
    if (!quizInProgress) return;
    event.preventDefault();
    event.returnValue = '';
  });

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

  const quizView = document.getElementById('quiz-view');
  const noQuizView = document.getElementById('no-quiz-view');
  const generatingView = document.getElementById('generating-quiz-view');
  const resultView = document.getElementById('result-view');

  // Falls back to the local bank ONLY if this exact topic happens to be
  // one of the ~10 built-in ones AND the real thing (below) couldn't be
  // reached - never the first choice anymore.
  function useLocalBankOrGiveUp() {
    const localQuestions = findQuestions(topic);
    if (localQuestions) {
      startQuiz(pickRandomQuestions(localQuestions, QUESTIONS_PER_ATTEMPT));
    } else {
      showNoQuiz();
    }
  }

  // Quiz questions come from Gemini now, not the local bank first - real
  // AI-generated questions for whatever topic was actually picked, same
  // as any topic outside the old local bank already got. Rotated among a
  // few cached generations per topic on the backend (see
  // quiz_generator.py's MAX_VARIANTS_PER_TOPIC) rather than calling the
  // AI fresh on every single attempt forever - real variety, without
  // unbounded cost against Gemini's limited free quota.
  if (getToken()) {
    generatingView.hidden = false;
    apiFetch('/quiz/generate', {
      method: 'POST',
      body: JSON.stringify({ subject, topic, level }),
    })
      .then((data) => {
        generatingView.hidden = true;
        if (data.available && data.questions?.length) {
          startQuiz(data.questions);
        } else {
          useLocalBankOrGiveUp();
        }
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        generatingView.hidden = true;
        // The AI call itself failed (quota exhausted, network hiccup,
        // API key issue) - fall back to the local bank rather than
        // leaving someone with no quiz at all, if we happen to have one
        // for this exact topic.
        useLocalBankOrGiveUp();
      });
  } else {
    useLocalBankOrGiveUp();
  }

  function showNoQuiz() {
    quizView.hidden = true;
    noQuizView.hidden = false;
    document.getElementById('skip-btn').addEventListener('click', () => {
      goToConnecting();
    });
  }

  function startQuiz(questions) {
  document.getElementById('quiz-topic-title').textContent = topic + ' Quiz';
  quizInProgress = true;

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
    quizInProgress = false; // submitted for real now - leaving from here on is fine

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

      // Fire-and-forget: a perfect score unlocks the "Perfect Quiz"
      // achievement server-side. Not blocking navigation on this - a
      // missed achievement notification shouldn't stop someone continuing.
      if (getToken()) {
        apiFetch('/achievements/report-perfect-quiz', { method: 'POST' })
          .catch((error) => console.warn('Could not report perfect quiz:', error.message));
      }
      // Only NOW - having actually proven they know the subject - claim
      // the real learner's request. AWAITED (not fire-and-forget) when the
      // request is a scheduled one - the "You're set!" message below is a
      // real claim ("they'll be notified, it's in Scheduled sessions"), so
      // it must only show once the backend has actually confirmed that,
      // not unconditionally. The backend also now rejects a SECOND fulfill
      // of the same request (e.g. reaching this page twice via the back
      // button) instead of silently creating a duplicate scheduled session -
      // this is what surfaces that rejection honestly instead of hiding it.
      const fulfillPromise = fulfillRequestId
        ? apiFetch(`/help-requests/${fulfillRequestId}/fulfill`, { method: 'POST' })
        : Promise.resolve(null);

      // Using .onclick (instead of addEventListener) means setting it
      // again always REPLACES the previous handler rather than stacking
      // a second one - handy here since finishQuiz() could technically
      // run more than once (e.g. if someone were able to submit twice).
      continueBtn.onclick = scheduled
        ? () => {
            continueBtn.disabled = true;
            fulfillPromise
              .then(() => {
                showInfoModal(`You're set! ${withName} will be notified, and this will show up in your Scheduled sessions.`, {
                  onClose: () => { window.location.href = 'home.html'; },
                });
              })
              .catch((error) => {
                showInfoModal(error.message === 'This request has already been taken.'
                  ? "You already claimed this one - no need to do it twice."
                  : "Couldn't confirm this with the server: " + error.message, {
                  onClose: () => { window.location.href = 'home.html'; },
                });
              });
          }
        : () => {
            const params = new URLSearchParams({ subject, topic, level, mode, requestId, with: withName, partnerId, country });
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
  } // end startQuiz()

  // ---------------------------------------------------------------
  // Shared by both the "no quiz available" and result views: continue
  // on to the same matching screen the "learn" flow uses.
  // ---------------------------------------------------------------
  function goToConnecting() {
    // No quiz was available at all for this topic - still counts as
    // "cleared" (nothing to fail), so the real request gets claimed here
    // same as a passed quiz would. Same reasoning as finishQuiz() above -
    // for a scheduled request, this is AWAITED so the "You're set!" claim
    // only shows once the backend has actually confirmed it, not
    // unconditionally (which used to let it show even when the backend
    // rejected a duplicate fulfill of the same request).
    const fulfillPromise = fulfillRequestId
      ? apiFetch(`/help-requests/${fulfillRequestId}/fulfill`, { method: 'POST' })
      : Promise.resolve(null);

    if (scheduled) {
      fulfillPromise
        .then(() => {
          showInfoModal(`You're set! ${withName} will be notified, and this will show up in your Scheduled sessions.`, {
            onClose: () => { window.location.href = 'home.html'; },
          });
        })
        .catch((error) => {
          showInfoModal(error.message === 'This request has already been taken.'
            ? "You already claimed this one - no need to do it twice."
            : "Couldn't confirm this with the server: " + error.message, {
            onClose: () => { window.location.href = 'home.html'; },
          });
        });
      return;
    }
    fulfillPromise.catch((error) => console.warn('Could not mark request fulfilled:', error.message));
    const connectParams = new URLSearchParams({ subject, topic, level, mode, requestId, with: withName, partnerId, country });
    window.location.href = 'connecting.html?' + connectParams.toString();
  }

});
