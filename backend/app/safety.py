# Physical addresses don't have a fixed pattern like a phone number or
# email does (see safety-check.js on the frontend, which catches those
# instantly), so catching them needs real reasoning, not pattern-matching -
# that means it's too slow to run BEFORE a message sends without making
# the chat feel laggy. Instead this runs AFTER the message has already
# gone out, and privately warns the sender if it looks like they shared
# an address - it can't prevent it, only flag it moments later.

import json

from google import genai
from google.genai import types

from app.config import Config
from app.extensions import socketio
from app.notification_helpers import create_notification

_client = None

# Below this length, there's essentially no room for a real address - skip
# the API call entirely rather than spending money/time checking "hi" or
# "ok thanks".
_MIN_LENGTH = 15

_RESPONSE_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'contains_address': {
            'type': 'BOOLEAN',
            'description': 'True only if the message contains or strongly implies a specific physical home/mailing address.',
        },
    },
    'required': ['contains_address'],
}


def _get_client():
    global _client
    if _client is None:
        if not Config.GEMINI_API_KEY:
            raise RuntimeError('GEMINI_API_KEY is not set in backend/.env')
        _client = genai.Client(api_key=Config.GEMINI_API_KEY)
    return _client


def check_message_for_address(text, sender_id, session_id=None):
    """Fire-and-forget: checks one message for a physical address and, if
    found, warns the sender both ways - a Notification (so they see it even
    if they've since left the chat) AND, if session_id is given, a live
    push straight into the chat itself (see sockets.py's 'safety_warning' -
    the sender is almost always still right there when this finishes a few
    seconds later, so surfacing it only on a separate Notifications page
    they'd have to go check made it easy to miss entirely). Any failure
    here (bad key, API hiccup) is swallowed - a safety NICE-TO-HAVE should
    never be able to break sending a chat message."""
    if len(text) < _MIN_LENGTH:
        return

    try:
        client = _get_client()
        response = client.models.generate_content(
            model='gemini-3.6-flash',
            contents=f'Message: "{text}"',
            config=types.GenerateContentConfig(
                response_mime_type='application/json',
                response_schema=_RESPONSE_SCHEMA,
            ),
        )
        data = json.loads(response.text)
    except Exception:
        return

    if data.get('contains_address'):
        warning = (
            "Heads up - your last message may have included a home address. "
            "Be careful sharing personal details with people you've just met online."
        )
        create_notification(sender_id, 'safety_warning', warning)
        if session_id is not None:
            socketio.emit('safety_warning', {'message': warning, 'sessionId': session_id}, room=f'user-{sender_id}')
