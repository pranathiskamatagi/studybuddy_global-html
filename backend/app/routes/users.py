from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import User
from app.notification_helpers import create_notification

users_bp = Blueprint('users', __name__, url_prefix='/api/users')


@users_bp.get('/<int:user_id>/profile-preview')
@jwt_required()
def profile_preview(user_id):
    # Anyone logged in can view anyone's LIMITED profile - see
    # User.to_limited_public_dict() for exactly what that excludes
    # (no email, no points/diamonds/streak/rating - just who they are).
    user = db.session.get(User, user_id)
    if not user:
        return jsonify(error='User not found.'), 404
    return jsonify(user=user.to_limited_public_dict())


@users_bp.get('/search')
@jwt_required()
def search_users():
    # A general "pick a real person" search - used by the Favorites/
    # Scheduled sessions/Quiz challenges screens' "+ Add" flows, unlike
    # /teaching (which only surfaces people who've self-tagged a subject).
    # Empty query still returns a real, useful starting list (most
    # recently joined) rather than nothing, so there's always someone to
    # pick even before typing.
    my_id = int(get_jwt_identity())
    q = (request.args.get('q') or '').strip().lower()

    query = User.query.filter(User.id != my_id)
    if q:
        query = query.filter(db.func.lower(User.fullname).contains(q))
    users = query.order_by(User.created_at.desc()).limit(20).all()

    return jsonify(users=[u.to_limited_public_dict() for u in users])


@users_bp.get('/teaching')
@jwt_required()
def browse_teachers():
    # Real people browsable by a subject they've self-marked as confident
    # teaching (see profile.py's teachesSubjects) - a way to find someone
    # BEFORE any match history exists between you, unlike matching.py's
    # scorer which only ranks people you already have a real signal about.
    my_id = int(get_jwt_identity())
    subject = (request.args.get('subject') or '').strip().lower()

    query = User.query.filter(User.id != my_id).filter(User.teaches_subjects.isnot(None))
    candidates = query.all()
    if subject:
        candidates = [
            u for u in candidates
            if any(subject in s.lower() for s in (u.teaches_subjects or []))
        ]
    else:
        candidates = [u for u in candidates if u.teaches_subjects]

    return jsonify(users=[u.to_limited_public_dict() for u in candidates])


@users_bp.post('/<int:user_id>/ask-to-teach')
@jwt_required()
def ask_to_teach(user_id):
    # The real gap in Find a Teacher: browsing to someone only ever
    # opened their (read-only) profile card - there was no way to
    # actually tell them "I want to learn this from you." A real,
    # immediate notification, not a session/request row - the teacher
    # decides what to do next (start a session, schedule one) themselves.
    my_id = int(get_jwt_identity())
    if user_id == my_id:
        return jsonify(error="That's your own profile."), 400

    teacher = db.session.get(User, user_id)
    if not teacher:
        return jsonify(error='User not found.'), 404

    data = request.get_json(silent=True) or {}
    topic = (data.get('topic') or '').strip()
    if not topic:
        return jsonify(error='A real topic is required.'), 400

    asker = db.session.get(User, my_id)
    create_notification(
        user_id, 'teach_request',
        f"{asker.fullname} wants to learn {topic} from you!",
    )
    return jsonify(status='ok')
