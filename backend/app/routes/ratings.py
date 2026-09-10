from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import User, StudySession, Rating
from app.gamification import award_rating
from app.notification_helpers import create_notification
from app.achievements import check_and_notify_eligible

ratings_bp = Blueprint('ratings', __name__, url_prefix='/api/sessions')


@ratings_bp.post('/<int:session_id>/rate')
@jwt_required()
def rate_session(session_id):
    rater_id = int(get_jwt_identity())
    session = db.session.get(StudySession, session_id)
    if not session:
        return jsonify(error='Session not found.'), 404

    data = request.get_json(silent=True) or {}
    stars = data.get('stars')
    badge_text = (data.get('badge_text') or '').strip()
    # ratee_id is OPTIONAL - kept nullable in case a rating is ever
    # attached to someone without a real account to point at. ratee_name
    # is a plain display name, used either way.
    ratee_id = data.get('ratee_id')
    ratee_name = (data.get('ratee_name') or '').strip() or None
    comment = (data.get('comment') or '').strip() or None

    if not isinstance(stars, int) or stars < 1 or stars > 5:
        return jsonify(error='stars must be an integer from 1 to 5.'), 400
    if not badge_text:
        return jsonify(error='badge_text is required.'), 400

    ratee = None
    if ratee_id:
        if ratee_id == rater_id:
            return jsonify(error="You can't rate yourself."), 400
        ratee = db.session.get(User, ratee_id)
        if not ratee:
            return jsonify(error='ratee_id does not match a real user.'), 404
        ratee_name = ratee.fullname

    already_rated = Rating.query.filter_by(session_id=session_id, rater_id=rater_id).first()
    if already_rated:
        return jsonify(error='You already rated this session.'), 409

    rating = Rating(
        session_id=session_id,
        rater_id=rater_id,
        ratee_id=ratee.id if ratee else None,
        ratee_name=ratee_name,
        stars=stars,
        badge_text=badge_text,
        comment=comment,
    )
    db.session.add(rating)

    rater = db.session.get(User, rater_id)
    bonus_diamond = award_rating(rater, ratee, stars)

    db.session.commit()
    check_and_notify_eligible(rater_id)

    if ratee:
        message = f"{rater.fullname} rated you {stars}★" + (f" for {session.topic}" if session.topic else "") + "."
        if bonus_diamond:
            # A real, human-visible reason for the diamond count to have
            # just gone up on THEIR side, not just the rater's - see
            # award_rating() for the "every 2 five-star ratings" rule.
            message += " That's earned you a bonus 💎 diamond!"
        create_notification(ratee.id, 'rating', message)

    return jsonify(
        rating={'id': rating.id, 'stars': rating.stars, 'badge_text': rating.badge_text},
        rater=rater.to_public_dict(),
    ), 201


@ratings_bp.post('/ratings/<int:rating_id>/feedback')
@jwt_required()
def submit_rating_feedback(rating_id):
    # The optional "what went wrong?" follow-up shown after a LOW rating
    # (see rate-partner.js) - a separate call from rate_session() above,
    # since it's only asked AFTER the star/badge rating already succeeded,
    # not part of that same submission.
    rater_id = int(get_jwt_identity())
    rating = db.session.get(Rating, rating_id)
    if not rating:
        return jsonify(error='Rating not found.'), 404
    # Only the person who left this rating can add feedback to it - stops
    # someone from attaching reasons to a rating that isn't theirs.
    if rating.rater_id != rater_id:
        return jsonify(error='This is not your rating.'), 403

    data = request.get_json(silent=True) or {}
    reasons = data.get('reasons') or []
    if not isinstance(reasons, list) or not all(isinstance(r, str) for r in reasons):
        return jsonify(error='reasons must be a list of strings.'), 400

    rating.feedback_reasons = reasons
    extra_comment = (data.get('comment') or '').strip()
    if extra_comment:
        # Append rather than overwrite - the rater may have ALSO left a
        # comment on the main rating screen already.
        rating.comment = (rating.comment + '\n\n' + extra_comment) if rating.comment else extra_comment

    db.session.commit()
    return jsonify(status='ok')
