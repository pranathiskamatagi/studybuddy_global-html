// Tapping the Learnora logo anywhere it appears opens it full-size.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.logo-box, .brand-mark, .app-logo-badge, .sidebar-logo').forEach((el) => {
    el.style.cursor = 'zoom-in';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'View the Learnora logo');
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      openImageLightbox('logo.png');
    });
  });
});
