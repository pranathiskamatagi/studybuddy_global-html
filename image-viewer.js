// Shared by session.js and group-chat.js: a "check it before you send it"
// preview for a picked image, and a WhatsApp-style full-screen viewer for
// any image already in the chat.
(function () {
  const style = document.createElement('style');
  style.textContent = `
    .img-overlay { position: fixed; inset: 0; z-index: 99999; display: flex; flex-direction: column;
      align-items: center; justify-content: center; background: rgba(8, 12, 28, 0.92); padding: 20px; font-family: Poppins, sans-serif; }
    .img-overlay img { max-width: 100%; max-height: 74vh; object-fit: contain; border-radius: 12px; }
    .img-overlay-close { position: absolute; top: 16px; right: 16px; width: 42px; height: 42px; border: none;
      border-radius: 50%; background: rgba(255,255,255,0.16); color: #fff; font-size: 22px; cursor: pointer; }
    .img-overlay-actions { display: flex; gap: 12px; margin-top: 18px; width: 100%; max-width: 360px; }
    .img-overlay-actions button { flex: 1; padding: 13px; border-radius: 999px; font: 700 15px Poppins, sans-serif; cursor: pointer; }
    .img-overlay-cancel { border: 1.5px solid rgba(255,255,255,0.4); background: none; color: #fff; }
    .img-overlay-send { border: none; background: linear-gradient(90deg, #3f6fe0, #34c77b); color: #fff; }
    .msg-image img { cursor: zoom-in; }
  `;
  document.head.appendChild(style);

  function buildOverlay(src) {
    const overlay = document.createElement('div');
    overlay.className = 'img-overlay';
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Image';
    overlay.appendChild(img);
    return overlay;
  }

  function closeOnEscape(close) {
    const handler = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }

  window.openImageLightbox = function (src) {
    const overlay = buildOverlay(src);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'img-overlay-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '✕';
    overlay.appendChild(closeBtn);
    let stopEscape;
    const close = () => { overlay.remove(); stopEscape(); };
    stopEscape = closeOnEscape(close);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target !== overlay.querySelector('img')) close();
    });
    document.body.appendChild(overlay);
  };

  window.showImagePreviewBeforeSend = function (src, onSend) {
    const overlay = buildOverlay(src);
    const actions = document.createElement('div');
    actions.className = 'img-overlay-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'img-overlay-cancel';
    cancelBtn.textContent = 'Cancel';
    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'img-overlay-send';
    sendBtn.textContent = 'Send';
    actions.append(cancelBtn, sendBtn);
    overlay.appendChild(actions);
    let stopEscape;
    const close = () => { overlay.remove(); stopEscape(); };
    stopEscape = closeOnEscape(close);
    cancelBtn.addEventListener('click', close);
    sendBtn.addEventListener('click', () => { close(); onSend(); });
    document.body.appendChild(overlay);
  };
})();
