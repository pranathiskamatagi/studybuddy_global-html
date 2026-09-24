// A reusable "just so you know" modal - one message, one OK button, no
// decision to make. Replaces every plain alert() used for a real
// confirmation message (like "Request posted!") - alert() always shows
// the browser's own unstyled "your-site.com says" box, which can't be
// branded and looks like it's not even part of the app. Reuses
// confirm-modal.css's card/message/button styles directly (same visual
// language, just a single button instead of Confirm/Cancel) - pages using
// this must also link confirm-modal.css.
function showInfoModal(message, options = {}) {
  let overlay = document.getElementById('info-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.id = 'info-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="confirm-card">
        <p class="confirm-message" id="info-message"></p>
        <div class="confirm-actions">
          <button type="button" class="confirm-ok-btn" id="info-ok-btn" style="flex: 1;">Got it</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.hidden = true;
    });
  }

  const messageEl = document.getElementById('info-message');
  const okBtn = document.getElementById('info-ok-btn');

  messageEl.textContent = message;
  okBtn.textContent = options.okText || 'Got it';

  okBtn.onclick = () => {
    overlay.hidden = true;
    if (options.onClose) options.onClose();
  };

  overlay.hidden = false;
}
