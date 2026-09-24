from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from google.genai import errors as genai_errors

from app.extensions import db
from app.models import User, QuizChallenge
from app.notification_helpers import create_notification
from app.gamification import QUIZ_CHALLENGE_ATTEND_COINS
from app.quiz_generator import get_or_generate_quiz


def _reward_text():
    return f" +{QUIZ_CHALLENGE_ATTEND_COINS} coins for taking it!"

challenges_bp = Blueprint('challenges', __name__, url_prefix='/api/challenges')


@challenges_bp.get('')
@jwt_required()
def list_challenges():
    my_id = int(get_jwt_identity())
    mine = (
        QuizChallenge.query
        .filter(db.or_(QuizChallenge.challenger_id == my_id, QuizChallenge.challenged_id == my_id))
        .order_by(QuizChallenge.created_at.desc())
        .all()
    )
    return jsonify(challenges=[c.to_public_dict() for c in mine])


@challenges_bp.post('')
@jwt_required()
def send_challenge():
    # Two ways to reach here: right after the CHALLENGER finishes their
    # own quiz (the frontend hands back the exact questions/score they
    # just got - see QuizChallenge.questions for why a shared topic name
    # alone isn't enough, see quiz_generator.py), OR sent directly without
    # playing it first - questions/score are both omitted, and a real
    # quiz is generated here instead, with no challenger_score to compare
    # against (just a real quiz waiting for the challenged person).
    my_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    challenged_id = data.get('challengedId')
    subject = (data.get('subject') or '').strip()
    topic = (data.get('topic') or '').strip()
    level = (data.get('level') or '').strip()
    questions = data.get('questions')
    score = data.get('score')
    count = data.get('count')  # only used for the sent-without-playing path below
    note = (data.get('note') or '').strip()[:300] or None  # a real limit, not enforced elsewhere

    if not challenged_id or int(challenged_id) == my_id:
        return jsonify(error="A real, different person to challenge is required."), 400
    if not topic:
        return jsonify(error='A real topic is required.'), 400

    sent_without_playing = questions is None and score is None
    if not sent_without_playing:
        if not isinstance(questions, list) or not questions:
            return jsonify(error='A real quiz (topic + questions) is required.'), 400
        if not isinstance(score, int) or score < 0 or score > len(questions):
            return jsonify(error='A real score is required.'), 400

    challenged = db.session.get(User, int(challenged_id))
    if not challenged:
        return jsonify(error='User not found.'), 404

    if sent_without_playing:
        try:
            generated = get_or_generate_quiz(subject, topic, level, count or 5)
        except RuntimeError as error:
            return jsonify(error=str(error)), 503
        except genai_errors.APIError as error:
            return jsonify(error=f'AI request failed: {error.message}'), 502
        questions = generated['questions']

    challenger = db.session.get(User, my_id)
    challenge = QuizChallenge(
        challenger_id=my_id,
        challenged_id=int(challenged_id),
        subject=subject or None,
        topic=topic,
        level=level or None,
        questions=questions,
        challenger_score=score,  # stays None for a sent-without-playing challenge
        total_questions=len(questions),
        note=note,
    )
    db.session.add(challenge)

    if sent_without_playing:
        db.session.commit()
        create_notification(
            int(challenged_id), 'quiz_challenge',
            f"{challenger.fullname} sent you a {topic} quiz challenge!",
        )
    else:
        # A real coin reward just for taking the quiz, same as the person
        # they're about to challenge will get too.
        challenger.points += QUIZ_CHALLENGE_ATTEND_COINS
        db.session.commit()

        create_notification(
            my_id, 'quiz_challenge_reward',
            f"You scored {score}/{len(questions)} on {topic}!" + _reward_text(),
        )
        create_notification(
            int(challenged_id), 'quiz_challenge',
            f"{challenger.fullname} challenged you to a {topic} quiz - they scored {score}/{len(questions)}!",
        )

    return jsonify(challenge=challenge.to_public_dict())


@challenges_bp.get('/<int:challenge_id>/play')
@jwt_required()
def get_challenge_to_play(challenge_id):
    my_id = int(get_jwt_identity())
    challenge = db.session.get(QuizChallenge, challenge_id)
    if not challenge or challenge.challenged_id != my_id:
        return jsonify(error='Challenge not found.'), 404
    if challenge.status == 'completed':
        # Without this, an old Home card or notification let someone take
        # the whole quiz again, only to be told at the very end that it
        # had already been played.
        return jsonify(error='You already played this challenge.'), 409
    return jsonify(challenge=challenge.to_play_dict())


@challenges_bp.post('/<int:challenge_id>/submit')
@jwt_required()
def submit_challenge_score(challenge_id):
    my_id = int(get_jwt_identity())
    challenge = db.session.get(QuizChallenge, challenge_id)
    if not challenge or challenge.challenged_id != my_id:
        return jsonify(error='Challenge not found.'), 404
    if challenge.status == 'completed':
        return jsonify(error='Already played this one.'), 400

    data = request.get_json(silent=True) or {}
    score = data.get('score')
    if not isinstance(score, int) or score < 0 or score > challenge.total_questions:
        return jsonify(error='A real score is required.'), 400

    challenge.challenged_score = score
    challenge.status = 'completed'
    from app.models import utcnow
    challenge.completed_at = utcnow()

    challenged = db.session.get(User, my_id)
    challenged.points += QUIZ_CHALLENGE_ATTEND_COINS
    db.session.commit()

    create_notification(
        my_id, 'quiz_challenge_reward',
        f"You scored {score}/{challenge.total_questions} on {challenge.topic}!" + _reward_text(),
    )

    # A challenge sent without the challenger playing it first (see
    # send_challenge) has no real challenger_score to compare against -
    # comparing an int to None would raise, not just render oddly.
    if challenge.challenger_score is None:
        winner_text = ''
    else:
        winner_text = (
            " It's a tie!" if score == challenge.challenger_score
            else f" {challenged.fullname} won!" if score > challenge.challenger_score
            else f" {challenged.fullname} played - you're still ahead!"
        )
    create_notification(
        challenge.challenger_id,
        'quiz_challenge_result',
        f"{challenged.fullname} played your {challenge.topic} challenge: {score}/{challenge.total_questions}.{winner_text}",
    )

    return jsonify(challenge=challenge.to_public_dict())
