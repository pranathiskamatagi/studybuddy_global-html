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
DEFAULT_QUESTION_COUNT = 5
# A generous but real ceiling - Gemini's response quality and the 12s
# timeout both degrade on an unbounded count, and nothing in the UI needs
# more than this for a real quiz.
MAX_QUESTION_COUNT = 20


def _response_schema(count):
    return {
        'type': 'OBJECT',
        'properties': {
            'questions': {
                'type': 'ARRAY',
                'minItems': count,
                'maxItems': count,
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


def get_or_generate_quiz(subject, topic, level, count=DEFAULT_QUESTION_COUNT):
    """Returns a dict ready for jsonify(). Cached by (topic, count) -
    a 5-question cached set can't serve someone who asked for 10, so each
    count keeps its own variant pool. Once MAX_VARIANTS_PER_TOPIC real
    generations exist for this (topic, count), a request picks a random
    one of them instead of paying for a new AI call; below that cap, it
    generates a genuinely new variant each time, so the pool actually
    fills up with different questions."""
    count = max(1, min(int(count or DEFAULT_QUESTION_COUNT), MAX_QUESTION_COUNT))
    existing = (
        QuizSet.query
        .filter(func.lower(QuizSet.topic) == topic.lower())
        .filter(QuizSet.question_count == count)
        .order_by(QuizSet.created_at.desc())
        .all()
    )
    if len(existing) >= MAX_VARIANTS_PER_TOPIC:
        return random.choice(existing).to_public_dict()

    client = _get_client()
    response = client.models.generate_content(
        model='gemini-3.6-flash',
        contents=(
            f'Write a {count}-question multiple-choice quiz about "{topic}"'
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
            response_schema=_response_schema(count),
            # Without a cap, a slow/rate-limited Gemini call can hang the
            # whole request for a minute or more (the SDK's default retry
            # behavior) while the person just stares at "Writing a quiz for
            # this topic..." - quiz.js already falls back to its local
            # bank the moment this call fails, so failing FAST here gets
            # them a working quiz sooner than waiting on a slow AI response
            # ever would. Scaled with count - a 20-question quiz genuinely
            # needs more generation time than a 5-question one.
            http_options=types.HttpOptions(
                timeout=12_000 + (count - DEFAULT_QUESTION_COUNT) * 800,
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        ),
    )
    data = json.loads(response.text)

    quiz = QuizSet(
        subject=subject or None, topic=topic, level=level or None,
        questions=data['questions'], question_count=count,
    )
    db.session.add(quiz)
    db.session.commit()

    return quiz.to_public_dict()
