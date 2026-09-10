from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db
from app.models import User, StudySession, Rating

profile_bp = Blueprint('profile', __name__, url_prefix='/api/profile')


def _current_user():
    user_id = get_jwt_identity()
    return db.session.get(User, int(user_id))


def _topics_for_mode(user_id, mode):
    # Real, distinct topics from the person's own COMPLETED sessions -
    # topic is the specific thing they picked (e.g. "Calculus"), falling
    # back to subject only if topic was left blank. Most recently studied
    # first, case-insensitively deduped so "algebra"/"Algebra" don't both
    # show up as separate chips.
    sessions = (
        StudySession.query
        .filter(StudySession.learner_id == user_id)
        .filter(StudySession.mode == mode)
        .filter(StudySession.ended_at.isnot(None))
        .order_by(StudySession.ended_at.desc())
        .all()
    )
    topics = []
    seen = set()
    for session in sessions:
        label = (session.topic or session.subject or '').strip()
        if not label or label.lower() in seen:
            continue
        seen.add(label.lower())
        topics.append(label)
    return topics


def _badges_for_user(user_id):
    # Every real rating requires a badge (rate-partner.js won't submit
    # without one), so the total rating count doubles as the total badge
    # count. Grouped by exact badge text, most recent first, with a count
    # for anyone who's received the same badge more than once.
    ratings = (
        Rating.query
        .filter_by(ratee_id=user_id)
        .order_by(Rating.created_at.desc())
        .all()
    )
    counts = {}
    order = []
    for rating in ratings:
        label = (rating.badge_text or '').strip()
        if not label:
            continue
        if label not in counts:
            order.append(label)
        counts[label] = counts.get(label, 0) + 1
    badges = [{'text': label, 'count': counts[label]} for label in order]
    return badges, len(ratings)


@profile_bp.get('')
@jwt_required()
def get_profile():
    user = _current_user()
    if not user:
        return jsonify(error='User not found.'), 404

    badges, badge_count = _badges_for_user(user.id)
    return jsonify(
        user=user.to_public_dict(),
        topicsLearnt=_topics_for_mode(user.id, 'learn'),
        topicsTaught=_topics_for_mode(user.id, 'teach'),
        badges=badges,
        badgeCount=badge_count,
    )


@profile_bp.put('')
@jwt_required()
def update_profile():
    user = _current_user()
    if not user:
        return jsonify(error='User not found.'), 404

    data = request.get_json(silent=True) or {}
    # Only these fields are editable here - points/diamonds/email are
    # deliberately NOT in this list, so a request can't just set its own
    # score by PUTting {"points": 999999}.
    for field in ('fullname', 'country', 'grade', 'language', 'bio'):
        if field in data:
            setattr(user, field, data[field])

    if 'photo' in data:
        photo = data['photo']
        # The frontend resizes/compresses before sending, but this is a
        # defense-in-depth cap regardless (~2MB of base64 text) so a
        # single request can't bloat the database unreasonably.
        if photo and len(photo) > 2_000_000:
            return jsonify(error='That photo is too large.'), 400
        user.photo_data = photo or None

    db.session.commit()
    return jsonify(user=user.to_public_dict())


@profile_bp.post('/change-password')
@jwt_required()
def change_password():
    user = _current_user()
    if not user:
        return jsonify(error='User not found.'), 404

    data = request.get_json(silent=True) or {}
    current_password = data.get('current_password') or ''
    new_password = data.get('new_password') or ''

    # check_password_hash requires the CURRENT password, not just being
    # logged in - a stolen/left-open session shouldn't be enough on its
    # own to lock the real owner out by changing their password.
    if not check_password_hash(user.password_hash, current_password):
        return jsonify(error='Your current password is incorrect.'), 401
    # Same minimum as signup.py - a weaker new password would defeat the
    # point of changing it.
    if len(new_password) < 8:
        return jsonify(error='New password must be at least 8 characters.'), 400

    user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    return jsonify(success=True)
