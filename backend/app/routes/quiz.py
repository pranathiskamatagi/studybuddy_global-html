from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from google.genai import errors as genai_errors

from app.quiz_generator import get_or_generate_quiz

quiz_bp = Blueprint('quiz', __name__, url_prefix='/api/quiz')


@quiz_bp.post('/generate')
@jwt_required()
def generate_quiz():
    # quiz.js calls this only when the topic isn't in its own hardcoded
    # question bank - see quiz.js's findQuestions().
    data = request.get_json(silent=True) or {}
    subject = (data.get('subject') or '').strip()
    topic = (data.get('topic') or '').strip()
    level = (data.get('level') or '').strip()

    if not topic:
        return jsonify(error='topic is required.'), 400

    try:
        result = get_or_generate_quiz(subject, topic, level)
    except RuntimeError as error:
        return jsonify(error=str(error)), 503
    except genai_errors.APIError as error:
        return jsonify(error=f'AI request failed: {error.message}'), 502

    return jsonify(**result)
