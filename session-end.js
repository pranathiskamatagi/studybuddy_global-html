document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // Read the session's details from the URL - session.js sends these
  // when "End session" is clicked (including a REAL elapsed-minutes
  // count, not a placeholder number).
  // ---------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const partnerName = params.get('partner') || 'your study partner';
  const partnerColor = params.get('color') || 'blue';
  const topic = params.get('topic') || '';
  const country = params.get('country') || '';
  const flag = params.get('flag') || '';
  const minutes = params.get('minutes') || '0';

  const summaryParts = [`${minutes} min`];
  if (topic) summaryParts.push(topic);
  document.getElementById('session-summary').textContent =
    summaryParts.join(' · ') + ` with ${partnerName}`;

  // ---------------------------------------------------------------
  // "Want AI summaries" - shows a demo mind map + summary screen.
  // The CONTENT is still placeholder (no AI backend yet - same plan
  // saved for AI-generated quiz questions), but the screen itself is real.
  // ---------------------------------------------------------------
  document.getElementById('ai-summary-btn').addEventListener('click', () => {
    // Pass along EVERYTHING this page itself received, so ai-summary.js
    // can reconstruct this exact same session-end screen when the user
    // clicks its "Back" button - not just send them all the way to Home.
    const aiParams = new URLSearchParams({ partner: partnerName, color: partnerColor, topic, country, flag, minutes });
    window.location.href = 'ai-summary.html?' + aiParams.toString();
  });

  // ---------------------------------------------------------------
  // "Back to Home"
  // ---------------------------------------------------------------
  document.getElementById('home-btn').addEventListener('click', () => {
    window.location.href = 'home.html';
  });

  // ---------------------------------------------------------------
  // "Rate your partner & give them a badge" - goes to its own screen
  // ---------------------------------------------------------------
  document.getElementById('rate-toggle-btn').addEventListener('click', () => {
    const rateParams = new URLSearchParams({ partner: partnerName, color: partnerColor, topic, country, flag });
    window.location.href = 'rate-partner.html?' + rateParams.toString();
  });

});
