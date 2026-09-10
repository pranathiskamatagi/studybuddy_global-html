# Off-topic detection - the one distraction signal that genuinely needs
# real reasoning (a topic doesn't have a fixed pattern like a phone number
# does), so it runs as a background AI check rather than blocking chat.
# The other two signals (tab-switching, quiet chat) are pure client-side
# timers - see safety-check.js's sibling logic in session.js/group-chat.js.

import json

from google import genai
from google.genai import types

from app.config import Config
from app.extensions import socketio, db
from app.models import Message, User

_client = None

# How many of the most recent messages to judge topic drift from - too
# few and one throwaway joke looks like "off-topic", too many and a real
# drift takes ages to notice.
_RECENT_MESSAGE_COUNT = 10

_RESPONSE_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'on_topic': {
            'type': 'BOOLEAN',
            'description': 'True if the recent conversation is still substantially about the given study topic.',
        },
    },
    'required': ['on_topic'],
}


def _get_client():
    global _client
    if _client is None:
        if not Config.GEMINI_API_KEY:
            raise RuntimeError('GEMINI_API_KEY is not set in backend/.env')
        _client = genai.Client(api_key=Config.GEMINI_API_KEY)
    return _client


def _sender_name(message):
    sender = db.session.get(User, message.sender_id)
    return sender.fullname if sender else 'Unknown'


def check_topic_drift(session_id, topic):
    """Fire-and-forget: if the recent conversation looks off-topic, nudges
    EVERYONE in the session live (a broadcast, like the existing
    'member_left' system notices) - not a persisted notification, since
    this is about the shared conversation in the moment, not a private
    heads-up to one person."""
    messages = (
        Message.query
        .filter_by(session_id=session_id)
        .order_by(Message.created_at.desc())
        .limit(_RECENT_MESSAGE_COUNT)
        .all()
    )
    if len(messages) < _RECENT_MESSAGE_COUNT:
        return  # not enough recent conversation to judge fairly

    transcript = '\n'.join(f'{_sender_name(m)}: {m.text}' for m in reversed(messages))

    try:
        client = _get_client()
        response = client.models.generate_content(
            model='gemini-3.6-flash',
            contents=(
                f'This is a real peer study session about "{topic}". Here is the most '
                f'recent part of the chat:\n\n{transcript}\n\n'
                'Is this conversation still substantially about the study topic above?'
            ),
            config=types.GenerateContentConfig(
                response_mime_type='application/json',
                response_schema=_RESPONSE_SCHEMA,
            ),
        )
        data = json.loads(response.text)
    except Exception:
        return

    if not data.get('on_topic', True):
        socketio.emit(
            'distraction_nudge',
            {'message': f'Looks like the conversation has drifted from {topic} - want to get back to studying?'},
            room=f'session-{session_id}',
        )
