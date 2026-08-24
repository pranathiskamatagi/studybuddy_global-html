document.addEventListener('DOMContentLoaded', () => {

  // This is the very first screen in the whole app - "Let's Get Started"
  // takes a new user into the signup flow. It had never had any
  // JavaScript wired to it before now, so clicking it did nothing.
  document.querySelector('.cta-button').addEventListener('click', () => {
    window.location.href = 'signup.html';
  });

});
