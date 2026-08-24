// "DOMContentLoaded" fires once the browser has finished building the page's
// HTML structure. Wrapping our code in this event listener guarantees every
// element below (form, inputs, buttons) already exists before we try to grab it.
document.addEventListener('DOMContentLoaded', () => {

  // getElementById grabs one specific element from the page by its id="..." attribute.
  // We save each one in a variable (a labeled box holding a value) so we can reuse it below.
  const form = document.getElementById('signup-form');
  const passwordInput = document.getElementById('password');
  const toggleBtn = document.getElementById('toggle-password');
  const eyeOpenIcon = toggleBtn.querySelector('.eye-open');   // querySelector finds an element INSIDE another element
  const eyeClosedIcon = toggleBtn.querySelector('.eye-closed');
  const agreeCheckbox = document.getElementById('agree-terms');
  const countrySelect = document.getElementById('country');
  const gradeSelect = document.getElementById('grade');
  const errorMessage = document.getElementById('form-error');

  // ---------------------------------------------------------------
  // FEATURE 1: Show/Hide password
  // ---------------------------------------------------------------
  // addEventListener attaches a function that runs whenever a specific
  // event (here, "click") happens on this element.
  toggleBtn.addEventListener('click', () => {
    const isCurrentlyHidden = passwordInput.type === 'password';

    // Changing an input's "type" is what actually shows/hides the typed characters
    passwordInput.type = isCurrentlyHidden ? 'text' : 'password';

    // .hidden is a real HTML/DOM property - setting it to true/false
    // adds or removes the "hidden" attribute, showing or hiding that element
    eyeOpenIcon.hidden = isCurrentlyHidden;
    eyeClosedIcon.hidden = !isCurrentlyHidden;

    toggleBtn.setAttribute('aria-label', isCurrentlyHidden ? 'Hide password' : 'Show password');
  });

  // ---------------------------------------------------------------
  // FEATURE 2: Validate and handle form submission
  // ---------------------------------------------------------------
  form.addEventListener('submit', (event) => {
    // Forms reload the whole page by default when submitted.
    // preventDefault() stops that so we can handle things with JS instead.
    event.preventDefault();

    // Start each attempt with the error message hidden, then only show it
    // again if we find a problem below.
    errorMessage.hidden = true;

    // .checked tells us whether a checkbox is ticked (true) or not (false)
    if (!agreeCheckbox.checked) {
      errorMessage.textContent = 'Please agree to the Terms & Conditions to continue.';
      errorMessage.hidden = false;
      return; // stops the function here, skipping everything below
    }

    // .value is the current text typed into an input
    if (passwordInput.value.length < 8) {
      errorMessage.textContent = 'Password must be at least 8 characters.';
      errorMessage.hidden = false;
      return;
    }

    if (!countrySelect.value || !gradeSelect.value) {
      errorMessage.textContent = 'Please select your country and grade.';
      errorMessage.hidden = false;
      return;
    }

    // Everything passed! There's no backend yet to actually create an
    // account, so we can't persist this - but the FLOW itself is real:
    // signing up takes you into the app, same as it would for real.
    window.location.href = 'home.html';
  });

  // ---------------------------------------------------------------
  // FEATURE 3: Terms & Conditions modal
  // ---------------------------------------------------------------
  const termsModal = document.getElementById('terms-modal');

  document.getElementById('terms-link').addEventListener('click', (event) => {
    event.preventDefault(); // stops the href="#" from jumping the page to the top
    termsModal.hidden = false;
  });

  document.getElementById('terms-close-btn').addEventListener('click', () => {
    termsModal.hidden = true;
  });

  // Clicking the dark backdrop (anywhere outside the white card) also
  // closes it - a common pattern for modals. event.target is whatever
  // was ACTUALLY clicked, so this only fires when that's the overlay
  // itself, not something inside the card.
  termsModal.addEventListener('click', (event) => {
    if (event.target === termsModal) {
      termsModal.hidden = true;
    }
  });

  // "I've read and agree" both closes the modal AND ticks the checkbox,
  // so agreeing here means you don't have to separately click it too.
  document.getElementById('terms-accept-btn').addEventListener('click', () => {
    agreeCheckbox.checked = true;
    termsModal.hidden = true;
  });

});
