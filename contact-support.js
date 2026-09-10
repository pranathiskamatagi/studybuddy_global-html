document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const form = document.getElementById('support-form');
  const messageInput = document.getElementById('message');
  const errorEl = document.getElementById('form-error');
  const submitBtn = form.querySelector('.save-btn');
  const formView = document.getElementById('form-view');
  const sentView = document.getElementById('sent-view');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;

    if (!messageInput.value.trim()) {
      errorEl.textContent = 'Please describe what you need help with.';
      errorEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      await apiFetch('/support', {
        method: 'POST',
        body: JSON.stringify({ message: messageInput.value.trim() }),
      });
      formView.hidden = true;
      sentView.hidden = false;
    } catch (error) {
      if (handleAuthError(error)) return;
      errorEl.textContent = error.message;
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send message';
    }
  });

  document.getElementById('done-btn').addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'home.html';
    }
  });

  document.getElementById('back-btn').addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });

});
