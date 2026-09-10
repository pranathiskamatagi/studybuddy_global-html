# Checks a chat image with Gemini BEFORE it's ever saved or shown to the
# other person - unlike safety.py's text address check, which only warns
# AFTER a message sends (text can't be checked without making the chat
# feel laggy). An image is a much bigger, deliberate single action - a
# few seconds' wait for a real check first is the right tradeoff, and it
# means nothing unsafe is EVER stored or delivered, not just flagged
# after the fact.

import base64
import json
import re

from google import genai
from google.genai import types

from app.config import Config

_client = None

_RESPONSE_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'is_safe': {
            'type': 'BOOLEAN',
            'description': (
                'True only if the image is appropriate to send in a chat between two students '
                'studying together - no nudity or sexual content, no graphic violence or gore, '
                'no self-harm imagery, and nothing else unsafe for a general teenage/young-adult audience.'
            ),
        },
        'reason': {
            'type': 'STRING',
            'description': 'A short, plain-English reason if unsafe (e.g. "contains explicit content") - empty string if safe.',
        },
    },
    'required': ['is_safe', 'reason'],
}

_DATA_URI_RE = re.compile(r'^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$', re.DOTALL)


def _get_client():
    global _client
    if _client is None:
        if not Config.GEMINI_API_KEY:
            raise RuntimeError('GEMINI_API_KEY is not set in backend/.env')
        _client = genai.Client(api_key=Config.GEMINI_API_KEY)
    return _client


class UnsafeImageError(Exception):
    """Raised when Gemini flags the image - .reason is a short, plain-
    English explanation safe to show the sender directly."""
    def __init__(self, reason):
        self.reason = reason
        super().__init__(reason)


def check_image_data_uri(data_uri):
    """Raises UnsafeImageError if flagged, ValueError if the data itself
    is malformed. Returns nothing on success - callers just proceed."""
    match = _DATA_URI_RE.match(data_uri or '')
    if not match:
        raise ValueError('That doesn\'t look like a real image file.')
    mime_type, b64_data = match.group(1), match.group(2)

    try:
        image_bytes = base64.b64decode(b64_data)
    except Exception:
        raise ValueError('Could not read that image file.')

    client = _get_client()
    response = client.models.generate_content(
        model='gemini-3.6-flash',
        contents=[
            'Is this image appropriate to send in a chat between two students studying together?',
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        ],
        config=types.GenerateContentConfig(
            response_mime_type='application/json',
            response_schema=_RESPONSE_SCHEMA,
        ),
    )
    data = json.loads(response.text)
    if not data.get('is_safe'):
        raise UnsafeImageError(data.get('reason') or 'This image looks like it might not be appropriate to send.')
