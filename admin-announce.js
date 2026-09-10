document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const form = document.getElementById('announce-form');
  const messageInput = document.getElementById('message');
  const errorEl = document.getElementById('form-error');
  const submitBtn = form.querySelector('.save-btn');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;

    if (!messageInput.value.trim()) {
      errorEl.textContent = 'Please write a message to send.';
      errorEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      const data = await apiFetch('/admin/announce', {
        method: 'POST',
        body: JSON.stringify({ message: messageInput.value.trim() }),
      });
      showPointsPopup('Sent!', { icon: '📣', sub: `Delivered to ${data.sentTo} users` });
      form.reset();
    } catch (error) {
      if (handleAuthError(error)) return;
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send to everyone';
    }
  });

});
