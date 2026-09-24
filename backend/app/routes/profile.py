from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db
from app.models import User, StudySession, Rating, GroupMembership
from app.gamification import MIN_MINUTES_FOR_POINTS

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
    #
    # Badge text is free-typed ("Choose my own" in rate-partner.js), so
    # there's no way to detect a mean one by its wording - but a badge
    # attached to a low-star rating is reliably a negative one, so those
    # are left out of what shows publicly on the profile.
    ratings = (
        Rating.query
        .filter_by(ratee_id=user_id)
        .order_by(Rating.created_at.desc())
        .all()
    )
    counts = {}
    order = []
    for rating in ratings:
        if rating.stars <= 2:
            continue
        label = (rating.badge_text or '').strip()
        if not label:
            continue
        if label not in counts:
            order.append(label)
        counts[label] = counts.get(label, 0) + 1
    badges = [{'text': label, 'count': counts[label]} for label in order]
    badge_count = sum(counts.values())
    return badges, badge_count


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

    if 'teachesSubjects' in data:
        raw = data['teachesSubjects']
        if not isinstance(raw, list):
            return jsonify(error='teachesSubjects must be a list.'), 400
        # Trimmed, deduped (case-insensitive), capped at a sane count/length
        # so this stays a short list of real subjects, not free-form abuse.
        cleaned = []
        seen = set()
        for item in raw:
            label = str(item).strip()[:60]
            if not label or label.lower() in seen:
                continue
            seen.add(label.lower())
            cleaned.append(label)
            if len(cleaned) >= 12:
                break
        user.teaches_subjects = cleaned

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


@profile_bp.get('/activity-calendar')
@jwt_required()
def activity_calendar():
    # Every real calendar day this person had at least one real, completed
    # session that qualified for points (same MIN_MINUTES_FOR_POINTS bar
    # gamification.py already uses for streaks) - 1-on-1 (either side) or
    # group, so this stays a real reflection of the same streak data,
    # just as a full history instead of only the current running count.
    user_id = int(get_jwt_identity())

    solo_dates = (
        db.session.query(StudySession.ended_at)
        .filter(db.or_(StudySession.learner_id == user_id, StudySession.partner_id == user_id))
        .filter(StudySession.ended_at.isnot(None))
        .filter(StudySession.minutes.isnot(None))
        .filter(StudySession.minutes > MIN_MINUTES_FOR_POINTS)
        .all()
    )
    group_session_ids = [m.session_id for m in GroupMembership.query.filter_by(user_id=user_id).all()]
    group_dates = []
    if group_session_ids:
        group_dates = (
            db.session.query(StudySession.ended_at)
            .filter(StudySession.id.in_(group_session_ids))
            .filter(StudySession.ended_at.isnot(None))
            .filter(StudySession.minutes.isnot(None))
            .filter(StudySession.minutes > MIN_MINUTES_FOR_POINTS)
            .all()
        )

    active_dates = sorted({row[0].date().isoformat() for row in solo_dates + group_dates})
    return jsonify(activeDates=active_dates)
