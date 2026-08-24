document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // FEATURE 1: Sidebar navigation (using EVENT DELEGATION)
  // ---------------------------------------------------------------
  // Instead of adding a click listener to all 13 sidebar buttons one by
  // one, we add ONE listener to their shared parent (#sidebar). Clicks
  // on any child bubble up to the parent, and we check what was
  // actually clicked using event.target.closest('.nav-item').
  // This is called "event delegation" - fewer listeners, same result,
  // and it even works on buttons added to the page later.
  const sidebar = document.getElementById('sidebar');

  sidebar.addEventListener('click', (event) => {
    // .closest() looks at the clicked element AND its ancestors, and
    // returns the first one matching '.nav-item' - useful because the
    // user might click directly on the <svg> icon INSIDE the button,
    // not the button itself.
    const clickedButton = event.target.closest('.nav-item');
    if (!clickedButton) return; // click landed somewhere else in the sidebar, ignore it

    // Remove "active" from whichever button currently has it...
    const currentActive = sidebar.querySelector('.nav-item.active');
    if (currentActive) currentActive.classList.remove('active');

    // ...then add it to the one that was just clicked.
    clickedButton.classList.add('active');

    // Log out needs a confirmation first, so it's handled separately
    // from the rest, which just navigate straight to their screen.
    if (clickedButton.dataset.label === 'Log out') {
      showConfirmModal('Log out of StudyBuddy Global?', () => {
        window.location.href = 'index.html';
      }, { confirmText: 'Log out', danger: true });
      return;
    }

    // Every sidebar item now goes somewhere real.
    const sidebarDestinations = {
      'Home': 'home.html',
      'Learn': 'choose-subject.html',
      'Teach': 'teach-subject.html',
      'Connect': 'connect.html',
      'Achievements': 'achievements.html',
      'Leaderboard': 'leaderboard.html',
      'Saved': 'saved.html',
      'Settings': 'settings.html',
      'Safety Center': 'safety-center.html',
      'Help & Support': 'help-support.html',
      'Profile': 'profile.html',
    };
    const destination = sidebarDestinations[clickedButton.dataset.label];
    if (destination) {
      window.location.href = destination;
    }
  });

  // ---------------------------------------------------------------
  // FEATURE 1b: Sidebar collapse/expand toggle
  // ---------------------------------------------------------------
  const sidebarToggle = document.getElementById('sidebar-toggle');

  sidebarToggle.addEventListener('click', () => {
    // classList.toggle() adds the class if it's missing, or removes it
    // if it's already there - perfect for an on/off switch like this.
    sidebar.classList.toggle('expanded');
  });

  // ---------------------------------------------------------------
  // FEATURE 2: Notification bell - opens the real Notifications screen,
  // and the red dot reflects REAL unread notifications from
  // localStorage (the same data notifications.js reads and writes),
  // not just a decorative dot that disappears on click.
  // ---------------------------------------------------------------
  const bellBtn = document.getElementById('bell-btn');
  const notifDot = document.getElementById('notif-dot');

  const storedNotifications = localStorage.getItem('studybuddy_notifications');
  const notifications = storedNotifications ? JSON.parse(storedNotifications) : [];
  const hasUnread = notifications.some((n) => !n.read);
  // No notifications saved yet at all (brand new visitor) still counts
  // as "has unread" here, since notifications.js seeds 2 unread ones
  // the first time that page loads.
  notifDot.hidden = storedNotifications ? !hasUnread : false;

  bellBtn.addEventListener('click', () => {
    window.location.href = 'notifications.html';
  });

  // ---------------------------------------------------------------
  // FEATURE 2b: Topbar avatar button also opens Profile
  // ---------------------------------------------------------------
  document.querySelector('.avatar-btn').addEventListener('click', () => {
    window.location.href = 'profile.html';
  });

  // ---------------------------------------------------------------
  // FEATURE 3: The WHOLE "I wanna learn" / "I wanna teach" card is clickable
  // ---------------------------------------------------------------
  const ctaRow = document.querySelector('.cta-row');

  function goToCta(card) {
    // dataset.cta reads the data-cta="learn"/"teach"/"group" attribute
    // we set on the card in the HTML, so this ONE function handles all three.
    const type = card.dataset.cta;

    if (type === 'learn') {
      window.location.href = 'choose-subject.html';
    } else if (type === 'teach') {
      window.location.href = 'teach-subject.html';
    } else {
      window.location.href = 'group-subject.html';
    }
  }

  // Mouse/touch: clicking anywhere inside a .cta-card triggers it.
  ctaRow.addEventListener('click', (event) => {
    const card = event.target.closest('.cta-card');
    if (card) goToCta(card);
  });

  // Keyboard: since these cards use role="button" instead of a real
  // <button>, the browser won't fire "click" on Enter/Space for us -
  // we have to listen for those keys ourselves to keep it accessible.
  ctaRow.addEventListener('keydown', (event) => {
    const card = event.target.closest('.cta-card');
    if (!card) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); // stops Space from also scrolling the page
      goToCta(card);
    }
  });

  // ---------------------------------------------------------------
  // FEATURE 4: "Join" buttons on active study sessions
  // ---------------------------------------------------------------
  // These cards each show a STACK of avatars (multiple people) - they're
  // group sessions, not a single study partner. So Join skips the
  // matching flow entirely and drops you straight into the group chat.
  const sessionsRow = document.getElementById('sessions-row');

  sessionsRow.addEventListener('click', (event) => {
    const button = event.target.closest('.join-btn');
    if (!button) return;

    // .closest('.session-card') walks UP from the button to find its
    // parent card, so we can read that card's topic (its <h4>) and
    // the subtitle line underneath it (e.g. "Class 10 · Intermediate").
    const card = button.closest('.session-card');
    const topic = card.querySelector('h4').textContent;
    const subtitle = card.querySelector('.session-sub').textContent;

    const params = new URLSearchParams({ topic, subtitle });
    window.location.href = 'group-chat.html?' + params.toString();
  });

  // ---------------------------------------------------------------
  // FEATURE 5: Community request buttons ("Help her" / "Learn from")
  // ---------------------------------------------------------------
  const requestsList = document.getElementById('requests-list');

  requestsList.addEventListener('click', (event) => {
    const button = event.target.closest('.request-btn');
    if (!button) return;

    const row = button.closest('.request-row');
    const personName = row.querySelector('.request-name').textContent;

    window.location.href = 'connecting.html?with=' + encodeURIComponent(personName);
  });

  // ---------------------------------------------------------------
  // FEATURE 6: Rotating quote flashcards (changes every 5 seconds)
  // ---------------------------------------------------------------
  // An ARRAY holds a list of values - here, one object per quote.
  // Each object groups a "text" and an "author" together under one name.
  const quotes = [
    { text: 'Education is the most powerful weapon which you can use to change the world.', author: '— Nelson Mandela' },
    { text: 'The beautiful thing about learning is that no one can take it away from you.', author: '— B.B. King' },
    { text: 'Tell me and I forget, teach me and I may remember, involve me and I learn.', author: '— Benjamin Franklin' },
    { text: 'The expert in anything was once a beginner.', author: '— Helen Hayes' },
    { text: 'Each one, teach one.', author: '— African-American Proverb' },
  ];

  const quoteContent = document.getElementById('quote-content');
  const quoteTextEl = document.getElementById('quote-text');
  const quoteAuthorEl = document.getElementById('quote-author');
  const quoteDots = document.getElementById('quote-dots');

  let currentQuoteIndex = 0;

  // Build one dot button per quote in the array, instead of hand-writing
  // them in the HTML. forEach runs this function once for every item -
  // "index" tells us WHICH quote (0, 1, 2...) each dot represents.
  quotes.forEach((quote, index) => {
    const dot = document.createElement('button'); // creates a brand-new <button> in memory
    dot.type = 'button';
    dot.className = 'quote-dot';
    dot.setAttribute('aria-label', `Show quote ${index + 1}`);
    dot.addEventListener('click', () => showQuote(index));
    quoteDots.appendChild(dot); // actually adds it to the page
  });

  // Updates the visible text/author and which dot looks "active".
  function showQuote(index) {
    currentQuoteIndex = index;
    quoteTextEl.textContent = `“${quotes[index].text}”`;
    quoteAuthorEl.textContent = quotes[index].author;

    // Loop over every dot and toggle "active" only on the matching one.
    quoteDots.querySelectorAll('.quote-dot').forEach((dot, dotIndex) => {
      dot.classList.toggle('active', dotIndex === index);
    });
  }

  // Fades the current quote out, swaps the text while it's invisible,
  // then fades the new one in - this is what makes it feel like a
  // flashcard flipping rather than text just snapping to something new.
  function nextQuote() {
    quoteContent.classList.add('fade-out');

    // setTimeout runs the given function once, after a delay (in ms).
    // 300ms matches the CSS transition duration on .quote-content, so
    // the text swap happens exactly while it's fully faded out.
    setTimeout(() => {
      const nextIndex = (currentQuoteIndex + 1) % quotes.length; // wraps back to 0 after the last quote
      showQuote(nextIndex);
      quoteContent.classList.remove('fade-out');
    }, 300);
  }

  showQuote(0); // show the first quote immediately on page load

  // setInterval runs a function repeatedly, forever, every N milliseconds -
  // this is what makes the quote keep changing on its own every 5 seconds.
  setInterval(nextQuote, 5000);

});
