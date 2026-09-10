# Real AI-generated mind maps + summaries, using Gemini to actually read a
# session's real chat transcript and reason about it - not a fixed
# template. Kept to a fixed shape (exactly 3 mind-map branches) to match
# the hand-built layout in ai-summary.html/css.

import json

from google import genai
from google.genai import types

from app.config import Config
from app.extensions import db
from app.models import Message, SessionSummary, User, utcnow

_client = None


def _get_client():
    # Created lazily (not at import time) so the app can still start up
    # even if GEMINI_API_KEY is missing - the error only surfaces when
    # someone actually tries to use this feature.
    global _client
    if _client is None:
        if not Config.GEMINI_API_KEY:
            raise RuntimeError('GEMINI_API_KEY is not set in backend/.env')
        _client = genai.Client(api_key=Config.GEMINI_API_KEY)
    return _client


_RESPONSE_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'central_topic': {'type': 'STRING', 'description': 'A short 2-4 word label for the main topic studied.'},
        'branches': {
            'type': 'ARRAY',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'label': {'type': 'STRING', 'description': 'A short (2-5 word) mind-map branch label.'},
                    'detail': {
                        'type': 'STRING',
                        'description': (
                            '1-2 real sentences explaining what was ACTUALLY discussed under this branch - '
                            'specific enough that someone who missed the conversation would actually learn '
                            'something from it, not just a restatement of the label.'
                        ),
                    },
                },
                'required': ['label', 'detail'],
            },
            'minItems': 3,
            'maxItems': 3,
            'description': 'Exactly 3 mind-map branches for the main sub-topics actually discussed, each with a short label AND a real explanation.',
        },
        'summary_points': {
            'type': 'ARRAY',
            'items': {'type': 'STRING'},
            'minItems': 3,
            'maxItems': 5,
            'description': '3-5 one-sentence summary bullet points of what was actually covered in the conversation.',
        },
    },
    'required': ['central_topic', 'branches', 'summary_points'],
}

# "Enough conversation" used to mean ONLY message count - but two long,
# substantial messages (someone pasting a real detailed explanation) can
# easily hold more real content than four short "ok"/"cool"/"thanks"/"bye"
# messages, and shouldn't be rejected just for arriving as fewer, bigger
# messages instead of many small ones. Either signal on its own is enough -
# a normal back-and-forth OR just genuinely substantial text, regardless
# of how many people sent it or how it was split up.
_MIN_MESSAGES = 4
_MIN_TOTAL_CHARS = 200  # roughly one real paragraph's worth of actual content


def get_or_create_summary(session):
    """Returns a dict ready for jsonify(). `available: False` means there
    isn't enough real chat yet to generate anything honest from."""
    existing = SessionSummary.query.filter_by(session_id=session.id).first()
    if existing:
        return existing.to_public_dict()

    messages = (
        Message.query
        .filter_by(session_id=session.id)
        .order_by(Message.created_at.asc())
        .all()
    )
    total_chars = sum(len(m.text or '') for m in messages)
    if len(messages) < _MIN_MESSAGES and total_chars < _MIN_TOTAL_CHARS:
        return {'available': False, 'reason': 'not_enough_conversation'}

    transcript = '\n'.join(f'{_sender_name(m)}: {m.text}' for m in messages)

    prompt = (
        f"Here is a real chat transcript from a peer study session"
        f"{f' about {session.topic}' if session.topic else ''}"
        f"{f' ({session.subject})' if session.subject else ''}.\n\n"
        f"{transcript}\n\n"
        "Based ONLY on what was actually discussed above, produce a mind map "
        "and summary of this specific conversation. Do not invent topics that "
        "weren't actually discussed."
    )

    client = _get_client()
    response = client.models.generate_content(
        model='gemini-3.6-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type='application/json',
            response_schema=_RESPONSE_SCHEMA,
        ),
    )
    data = json.loads(response.text)

    summary = SessionSummary(
        session_id=session.id,
        central_topic=data['central_topic'],
        branches=data['branches'],
        summary_points=data['summary_points'],
        created_at=utcnow(),
    )
    db.session.add(summary)
    db.session.commit()

    return summary.to_public_dict()


def _sender_name(message):
    sender = db.session.get(User, message.sender_id)
    return sender.fullname if sender else 'Unknown'
