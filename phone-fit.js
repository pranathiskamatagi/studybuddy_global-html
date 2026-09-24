// Every page asks the phone for a 730px-wide layout (see the viewport line
// in each page). If a phone ignores that and still reports a narrow
// window, this switches on the backup way of shrinking the page
// (phone-zoom.css).
if (window.innerWidth > 0 && window.innerWidth < 500) {
  document.documentElement.classList.add('phone-fallback');
}
