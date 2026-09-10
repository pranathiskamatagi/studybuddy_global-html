# Real AI-generated quiz questions for a topic outside quiz.js's built-in
# question bank (~10 hardcoded topics). Same pattern as ai_summary.py -
# cached per topic (see QuizSet), so repeat requests for the same topic
# don't ALWAYS spend another AI request. But a single eternal cache meant
# every future quiz on that topic, for anyone, forever, showed the exact
# same 5 questions - up to MAX_VARIANTS_PER_TOPIC real generations are
# kept per topic instead, picked at random once that cap is reached, so
# repeat attempts genuinely vary without letting quota-limited Gemini
# calls (see the account's free daily quota) grow unbounded per topic.

import json
import random

from google import genai
from google.genai import types
from sqlalchemy import func

from app.config import Config
from app.extensions import db
from app.models import QuizSet

_client = None
MAX_VARIANTS_PER_TOPIC = 3

_RESPONSE_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'questions': {
            'type': 'ARRAY',
            'minItems': 5,
            'maxItems': 5,
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'q': {'type': 'STRING', 'description': 'The question text.'},
                    'options': {
                        'type': 'ARRAY',
                        'items': {'type': 'STRING'},
                        'minItems': 4,
                        'maxItems': 4,
                        'description': 'Exactly 4 answer choices.',
                    },
                    'correct': {
                        'type': 'INTEGER',
                        'description': 'Index (0-3) of the correct option in the options array.',
                    },
                },
                'required': ['q', 'options', 'correct'],
            },
        },
    },
    'required': ['questions'],
}


def _get_client():
    global _client
    if _client is None:
        if not Config.GEMINI_API_KEY:
            raise RuntimeError('GEMINI_API_KEY is not set in backend/.env')
        _client = genai.Client(api_key=Config.GEMINI_API_KEY)
    return _client


def get_or_generate_quiz(subject, topic, level):
    """Returns a dict ready for jsonify(). Cached by topic (case-
    insensitive) - once MAX_VARIANTS_PER_TOPIC real generations exist for
    this topic, a request picks a random one of them instead of paying for
    a new AI call; below that cap, it generates a genuinely new variant
    each time, so the pool actually fills up with different questions."""
    existing = (
        QuizSet.query
        .filter(func.lower(QuizSet.topic) == topic.lower())
        .order_by(QuizSet.created_at.desc())
        .all()
    )
    if len(existing) >= MAX_VARIANTS_PER_TOPIC:
        return random.choice(existing).to_public_dict()

    client = _get_client()
    response = client.models.generate_content(
        model='gemini-3.6-flash',
        contents=(
            f'Write a 5-question multiple-choice quiz about "{topic}"'
            f'{f" ({subject})" if subject else ""}'
            f'{f", at a {level} level" if level else ""}. '
            'This needs to be genuinely EASY - favor simple CONCEPTUAL and DEFINITIONAL '
            'questions ("what does ___ mean", "which of these is an example of ___", '
            '"what is the term for ___") over anything requiring multi-step calculation, '
            'algebraic manipulation, or transforming an expression into another form. If a '
            'question does need a computed answer, it must be solvable in ONE simple step '
            'with small, easy numbers - never a multi-step process (e.g. NOT finding a '
            'vertex/roots/intercepts of an equation, NOT simplifying a multi-term '
            'expression, NOT anything needing more than one arithmetic operation to reach '
            'the answer). Stay at the most basic, foundational level of this topic - '
            'imagine writing this for someone who just started learning it, not someone '
            'preparing for a test on it. Avoid advanced edge cases, unusual special cases, '
            'or ideas from a MORE advanced topic than the one asked about (for example, if '
            'asked about a general topic like "quadratic equations", stick to the basic '
            'idea of what one looks like - do not require solving one, finding its vertex, '
            'or bringing in complex/imaginary numbers, unless that is specifically the '
            'topic itself). '
            'Each question needs exactly 4 answer options with exactly one correct answer. '
            'Write everything in plain English, and use REAL math symbols where they '
            'normally belong (+, -, ×, ÷, =, <, >, parentheses, exponents like x^2) instead '
            'of spelling them out as words (never write "plus", "minus", "equals" etc. in '
            'place of the actual symbol) - just avoid garbled, non-English, or otherwise '
            'unreadable characters.'
        ),
        config=types.GenerateContentConfig(
            response_mime_type='application/json',
            response_schema=_RESPONSE_SCHEMA,
            # Without a cap, a slow/rate-limited Gemini call can hang the
            # whole request for a minute or more (the SDK's default retry
            # behavior) while the person just stares at "Writing a quiz for
            # this topic..." - quiz.js already falls back to its local
            # bank the moment this call fails, so failing FAST here (one
            # attempt, 12s) gets them a working quiz sooner than waiting on
            # a slow AI response ever would.
            http_options=types.HttpOptions(
                timeout=12_000,
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        ),
    )
    data = json.loads(response.text)

    quiz = QuizSet(subject=subject or None, topic=topic, level=level or None, questions=data['questions'])
    db.session.add(quiz)
    db.session.commit()

    return quiz.to_public_dict()
