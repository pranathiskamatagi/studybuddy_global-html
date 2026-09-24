document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const user = getStoredUser();
  const linkTextEl = document.getElementById('link-text');
  const copyBtn = document.getElementById('copy-btn');
  const referralCountEl = document.getElementById('referral-count');

  const referralLink = `${window.location.origin}/signup.html?ref=${user.id}`;
  linkTextEl.textContent = referralLink;

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(referralLink).then(() => {
      const original = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = original; }, 1500);
    });
  });

  apiFetch('/auth/me')
    .then((data) => {
      const count = data.user.referralCount || 0;
      referralCountEl.textContent = count === 0
        ? "Nobody's used your link yet."
        : `${count} friend${count === 1 ? '' : 's'} joined using your link so far.`;
    })
    .catch(() => {
      referralCountEl.textContent = '';
    });

  document.getElementById('back-btn').addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });

});
