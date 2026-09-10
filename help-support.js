document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // FAQ accordion - clicking a question toggles ITS OWN answer open,
  // and closes any other one that was already open.
  // ---------------------------------------------------------------
  document.getElementById('faq-list').addEventListener('click', (event) => {
    const questionBtn = event.target.closest('.faq-question');
    if (!questionBtn) return;

    const clickedItem = questionBtn.closest('.faq-item');
    const wasOpen = clickedItem.classList.contains('open');

    document.querySelectorAll('.faq-item.open').forEach((item) => item.classList.remove('open'));

    if (!wasOpen) clickedItem.classList.add('open');
  });

  document.getElementById('contact-btn').addEventListener('click', () => {
    window.location.href = 'contact-support.html';
  });

});
