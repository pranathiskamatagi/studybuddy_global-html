// Shared by session.js and group-chat.js - a quick, INSTANT check (no
// network call, so no delay) run on a message right before it's sent, to
// catch someone accidentally about to share personal info with someone
// they just met. This is deliberately simple pattern-matching, not AI -
// it can't understand context, so it can still have the occasional false
// positive - but the person can always confirm "send anyway" if it's a
// false alarm, and this stays instant/free by design (see the note on
// why this ISN'T an AI call, in the memory for this project).
//
// Physical addresses aren't caught here - they don't have a fixed pattern
// like a phone number does, so those are checked separately, after the
// fact, by a slower AI-based check server-side (see app/safety.py).

function detectRiskyContent(text) {
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  if (emailPattern.test(text)) return 'an email address';

  const passwordPattern = /\b(password|pwd|passcode)\s*(is|:|=)\s*\S+/i;
  if (passwordPattern.test(text)) return 'a password';

  // Looks for 10 or more digits close together (real phone numbers are
  // ~10 digits, +country code) - with or without common separators
  // (spaces, dashes, dots, parentheses), e.g. "9876543210",
  // "987-654-3210", "+91 98765 43210". Requiring 10 (not just "a handful
  // of digits somewhere") avoids flagging shorter coincidental numbers
  // (an order number, a room number, etc.) as if they were a phone number.
  const phonePattern = /(?:\d[\s.\-()]*){9,}\d/;
  if (phonePattern.test(text)) return 'a phone number';

  return null;
}
