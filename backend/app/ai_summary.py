# Real AI-generated mind maps + summaries, using Gemini to actually read a
# session's real chat transcript and reason about it - not a fixed
# template. Branch count is flexible (2-6) instead of a fixed 3, so a
# short conversation doesn't get padded with filler and a rich one
# doesn't get real content cut to fit - the frontend renders however
# many come back as a scrollable list (see ai-summary.html/css).

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
                            '1-3 real sentences explaining what was ACTUALLY discussed under this branch - '
                            'specific enough that someone who missed the conversation would actually learn '
                            'something from it, not just a restatement of the label. Reference the actual '
                            'terms, numbers, or examples used in the transcript rather than a generic '
                            'textbook description of the label.'
                        ),
                    },
                },
                'required': ['label', 'detail'],
            },
            'minItems': 2,
            'maxItems': 6,
            'description': (
                'One branch per genuinely distinct sub-topic actually discussed - however many that '
                'really is (between 2 and 6). Never pad with a filler branch to hit a round number, and '
                'never merge two distinct sub-topics into one branch just to stay under a limit.'
            ),
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

    # Gemini only ever sees the typed transcript, never the audio itself -
    # a voice message has no m.text at all, so without this it would just
    # silently vanish from the summary as a blank line. Naming it explicitly
    # keeps the transcript honest about what it's actually working from,
    # and the prompt below tells Gemini to flag it too.
    transcript = '\n'.join(
        f"{_sender_name(m)}: {m.text if m.text else '[sent a voice message - not included, only typed text can be summarized]'}"
        for m in messages
    )

    prompt = (
        f"Here is a real chat transcript from a peer study session"
        f"{f' about {session.topic}' if session.topic else ''}"
        f"{f' ({session.subject})' if session.subject else ''}.\n\n"
        f"{transcript}\n\n"
        "Produce a mind map and summary of THIS SPECIFIC conversation, following these rules strictly:\n"
        "1. Every branch, detail, and summary point must be grounded in something one of these two "
        "people actually typed above - not outside knowledge about the general subject, and not a "
        "plausible-sounding guess at what a conversation on this topic would probably cover.\n"
        "2. If the transcript is short or shallow on a point, say only what's really there - a short, "
        "honest detail beats a longer invented one.\n"
        "3. Do not add topics, examples, numbers, or explanations that were never mentioned, even if "
        "they would normally be part of this subject.\n"
        "4. Be specific: quote or closely paraphrase the actual wording, examples, or numbers used, "
        "rather than a generic textbook restatement of the branch label.\n"
        "5. If the transcript contains '[sent a voice message - not included, only typed text can be "
        "summarized]', add ONE short closing note to the summary saying some voice messages in this "
        "session couldn't be included."
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
