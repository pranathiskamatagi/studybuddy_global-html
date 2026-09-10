from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import User, UnlockedAchievement
from app.achievements import ACHIEVEMENTS, get_status, report_perfect_quiz, claim_achievement

achievements_bp = Blueprint('achievements', __name__, url_prefix='/api/achievements')


@achievements_bp.get('')
@jwt_required()
def list_achievements():
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify(error='User not found.'), 404

    rows_by_key = {row.key: row for row in UnlockedAchievement.query.filter_by(user_id=user_id).all()}

    results = []
    for key, definition in ACHIEVEMENTS.items():
        row = rows_by_key.get(key)
        current, target, claimed, claimable = get_status(key, user, row)
        results.append({
            'key': key,
            'title': definition['title'],
            'description': definition['description'],
            'reward': definition['reward_text'],
            'current': current,
            'target': target,
            'claimed': claimed,
            'claimable': claimable,
            'claimedAt': row.claimed_at.isoformat() if row and row.claimed_at else None,
        })

    return jsonify(achievements=results)


@achievements_bp.post('/report-perfect-quiz')
@jwt_required()
def report_perfect_quiz_route():
    # quiz.js calls this directly on a 5/5 score - there's no other
    # backend trail to check a real quiz result against, since the
    # question bank is entirely client-side. Marks it eligible to claim -
    # doesn't grant the reward itself, same as every other achievement.
    user_id = int(get_jwt_identity())
    newly_eligible = report_perfect_quiz(user_id)
    return jsonify(status='ok', newlyEligible=newly_eligible)


@achievements_bp.post('/<key>/claim')
@jwt_required()
def claim(key):
    user_id = int(get_jwt_identity())
    user, error = claim_achievement(user_id, key)
    if error:
        return jsonify(error=error), 400
    return jsonify(user=user.to_public_dict())
