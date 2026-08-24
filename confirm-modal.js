// ---------------------------------------------------------------
// A reusable "are you sure?" modal, shared by every page that used to
// call the browser's own confirm() - which always shows an ugly
// "your-site.com says" box that can't be styled or branded.
// ---------------------------------------------------------------
//
// IMPORTANT DIFFERENCE from confirm():
// Real confirm() PAUSES your code and waits right there for an answer.
// A custom modal can't do that - the page can't freeze itself waiting
// for a click. So instead of writing:
//
//     if (confirm("Log out?")) { ...do the thing... }
//
// you now write:
//
//     showConfirmModal("Log out?", () => { ...do the thing... });
//
// That second argument is a CALLBACK - a function you hand over that
// this file will run LATER, only if the person actually clicks Confirm.

function showConfirmModal(message, onConfirm, options = {}) {
  // Build the modal's HTML once and reuse it for every call, instead of
  // creating brand new elements each time.
  let overlay = document.getElementById('confirm-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.id = 'confirm-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="confirm-card">
        <p class="confirm-message" id="confirm-message"></p>
        <div class="confirm-actions">
          <button type="button" class="confirm-cancel-btn" id="confirm-cancel-btn">Cancel</button>
          <button type="button" class="confirm-ok-btn" id="confirm-ok-btn">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Clicking the dark backdrop itself (not the card) cancels, same as
    // clicking Cancel.
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.hidden = true;
    });
  }

  const messageEl = document.getElementById('confirm-message');
  const okBtn = document.getElementById('confirm-ok-btn');
  const cancelBtn = document.getElementById('confirm-cancel-btn');

  messageEl.textContent = message;
  okBtn.textContent = options.confirmText || 'OK';
  okBtn.classList.toggle('danger', Boolean(options.danger));

  // .onclick (instead of addEventListener) REPLACES the previous
  // handler instead of stacking a new one on top each time this
  // function runs - important since showConfirmModal() gets called
  // repeatedly with a DIFFERENT callback each time.
  okBtn.onclick = () => {
    overlay.hidden = true;
    onConfirm();
  };
  cancelBtn.onclick = () => {
    overlay.hidden = true;
  };

  overlay.hidden = false;
}
