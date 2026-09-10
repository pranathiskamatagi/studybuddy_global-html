# Real Gemini check of a session's ACTUAL chat transcript against the
# recommended techniques from teaching-tips.html - not a self-report
# checkbox, since there's no honest way to verify "I followed these tips"
# from a tick-box alone (see gamification.py's TEACHING_TIPS_BONUS_*).
# Same "let the AI read what really happened" approach as ai_summary.py
# and safety.py's address check, just reading for a different question.

import json

from google import genai
from google.genai import types

from app.config import Config
from app.extensions import db
from app.models import Message, User
from app.gamification import TEACHING_TIPS_BONUS_FOR_TEACHER, TEACHING_TIPS_BONUS_FOR_LEARNER
from app.notification_helpers import create_notification

_client = None

# Below this many real messages, there's not enough of a real
# conversation to honestly judge teaching technique either way.
_MIN_MESSAGES = 6

_RESPONSE_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'followed_good_teaching_practices': {
            'type': 'BOOLEAN',
            'description': (
                'True only if the TEACHER clearly did MOST of the following during this real '
                'conversation: opened with a curious question rather than diving straight into '
                'the explanation, gave the learner a moment to think or guess before explaining, '
                'broke the topic into small parts instead of one big explanation, used multiple '
                'examples (ideally including a real-life one), asked the learner questions '
                '(a two-way conversation, not one-sided), and/or worked through a practice '
                'problem together. A short, thin, or purely one-sided lecture-style '
                'conversation should be False.'
            ),
        },
    },
    'required': ['followed_good_teaching_practices'],
}


def _get_client():
    global _client
    if _client is None:
        if not Config.GEMINI_API_KEY:
            raise RuntimeError('GEMINI_API_KEY is not set in backend/.env')
        _client = genai.Client(api_key=Config.GEMINI_API_KEY)
    return _client


def check_and_award_teaching_tips_bonus(session_id, teacher_id, learner_id):
    """Fire-and-forget, called after a real 1-on-1 teach/learn session ends
    (see sessions.py's end_session). Reads the actual transcript and, if
    Gemini judges the teacher genuinely used the recommended techniques,
    awards a real bonus to BOTH sides - the teacher for teaching well, and
    the learner for engaging with a well-taught session. Any failure here
    (bad key, API hiccup) is swallowed - a bonus NICE-TO-HAVE should never
    be able to break ending a session."""
    messages = (
        Message.query
        .filter_by(session_id=session_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    if len(messages) < _MIN_MESSAGES:
        return

    transcript = '\n'.join(
        f'{"Teacher" if m.sender_id == teacher_id else "Learner"}: {m.text}'
        for m in messages if m.text
    )
    if not transcript.strip():
        return

    try:
        client = _get_client()
        response = client.models.generate_content(
            model='gemini-3.6-flash',
            contents=f'Here is a real 1-on-1 teach/learn chat transcript:\n\n{transcript}',
            config=types.GenerateContentConfig(
                response_mime_type='application/json',
                response_schema=_RESPONSE_SCHEMA,
            ),
        )
        data = json.loads(response.text)
    except Exception:
        return

    if not data.get('followed_good_teaching_practices'):
        return

    teacher = db.session.get(User, teacher_id)
    if teacher:
        teacher.points += TEACHING_TIPS_BONUS_FOR_TEACHER
        create_notification(
            teacher.id, 'bonus',
            f"Great teaching! You used effective techniques this session - +{TEACHING_TIPS_BONUS_FOR_TEACHER} bonus coins.",
        )

    learner = db.session.get(User, learner_id)
    if learner:
        learner.points += TEACHING_TIPS_BONUS_FOR_LEARNER
        create_notification(
            learner.id, 'bonus',
            f"Your teacher used great techniques and you engaged well - +{TEACHING_TIPS_BONUS_FOR_LEARNER} bonus coins!",
        )

    db.session.commit()
