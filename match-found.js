document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // A small pool of possible study partners to "match" with.
  // ---------------------------------------------------------------
  // There's no real backend yet, so we pick one of these at random
  // instead of actually searching a database of real users.
  const partners = [
    { name: 'Aditi Rao', rating: 4.8, color: 'blue', country: 'India', flag: '🇮🇳' },
    { name: 'Marcus Chen', rating: 4.9, color: 'green', country: 'Singapore', flag: '🇸🇬' },
    { name: 'Sofia Martinez', rating: 4.7, color: 'pink', country: 'Mexico', flag: '🇲🇽' },
    { name: 'Kabir Singh', rating: 5.0, color: 'orange', country: 'Canada', flag: '🇨🇦' },
    { name: 'Emma Wilson', rating: 4.6, color: 'blue', country: 'United Kingdom', flag: '🇬🇧' },
    { name: 'Ravi Patel', rating: 4.9, color: 'green', country: 'Kenya', flag: '🇰🇪' },
  ];

  // Math.random() gives a decimal between 0 (inclusive) and 1 (exclusive).
  // Multiplying by the array's length and rounding down (Math.floor)
  // turns that into a random valid INDEX into the array - a common
  // pattern anytime you want to pick one random item from a list.
  const partner = partners[Math.floor(Math.random() * partners.length)];

  // ---------------------------------------------------------------
  // Read subject/topic/level - same query string pattern used by
  // connecting.html, quiz.html, and teaching-tips.html.
  // ---------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const subject = params.get('subject') || '';
  const topic = params.get('topic') || '';
  const level = params.get('level') || '';

  document.getElementById('partner-avatar').textContent = partner.name.charAt(0);
  document.getElementById('partner-avatar').classList.add('avatar-' + partner.color);
  document.getElementById('partner-name').textContent = partner.name;
  document.getElementById('partner-rating').textContent = `★ ${partner.rating.toFixed(1)} rating`;

  if (topic) {
    document.getElementById('match-desc').textContent = `You're matched to connect on ${topic}.`;
  }
  document.getElementById('tag-subject').textContent = subject || 'General';
  document.getElementById('tag-level').textContent = level || 'Any level';
  document.getElementById('tag-country').textContent = `${partner.flag} ${partner.country}`;

  // ---------------------------------------------------------------
  // "Start Session"
  // ---------------------------------------------------------------
  document.getElementById('start-session-btn').addEventListener('click', () => {
    const sessionParams = new URLSearchParams({
      partner: partner.name,
      color: partner.color,
      topic,
      country: partner.country,
      flag: partner.flag,
    });
    window.location.href = 'session.html?' + sessionParams.toString();
  });

  // ---------------------------------------------------------------
  // "Find someone else" - goes back to the matching screen to re-search.
  // ---------------------------------------------------------------
  document.getElementById('find-other-btn').addEventListener('click', () => {
    const connectParams = new URLSearchParams({ subject, topic, level });
    window.location.href = 'connecting.html?' + connectParams.toString();
  });

});
