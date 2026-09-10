from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db, socketio
from app.models import User, StudySession, Message, GroupMembership, Report, Rating
from app.admin_helpers import current_user_is_admin
from app.notification_helpers import create_notification

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')


def _forbid_non_admin():
    if not current_user_is_admin():
        return jsonify(error='Admin only.'), 403
    return None


@admin_bp.get('/users')
@jwt_required()
def list_users():
    denied = _forbid_non_admin()
    if denied:
        return denied

    users = User.query.order_by(User.id).all()
    return jsonify(users=[
        {
            'id': u.id,
            'fullname': u.fullname,
            'email': u.email,
            'country': u.country,
            'isAdmin': u.is_admin,
            'isBanned': u.is_banned,
        }
        for u in users
    ])


@admin_bp.post('/users/<int:user_id>/ban')
@jwt_required()
def ban_user(user_id):
    denied = _forbid_non_admin()
    if denied:
        return denied

    my_id = int(get_jwt_identity())
    target = db.session.get(User, user_id)
    if not target:
        return jsonify(error='User not found.'), 404
    if target.id == my_id:
        return jsonify(error="You can't ban yourself."), 400
    if target.is_admin:
        return jsonify(error="You can't ban another admin."), 400

    target.is_banned = True
    db.session.commit()
    return jsonify(status='ok')


@admin_bp.post('/users/<int:user_id>/unban')
@jwt_required()
def unban_user(user_id):
    denied = _forbid_non_admin()
    if denied:
        return denied

    target = db.session.get(User, user_id)
    if not target:
        return jsonify(error='User not found.'), 404

    target.is_banned = False
    db.session.commit()
    return jsonify(status='ok')


@admin_bp.get('/sessions')
@jwt_required()
def list_sessions():
    denied = _forbid_non_admin()
    if denied:
        return denied

    sessions = StudySession.query.order_by(StudySession.id.desc()).limit(200).all()
    result = []
    for s in sessions:
        if s.mode == 'group':
            members = GroupMembership.query.filter_by(session_id=s.id).all()
            names = [db.session.get(User, m.user_id).fullname for m in members if db.session.get(User, m.user_id)]
        else:
            learner = db.session.get(User, s.learner_id)
            partner = db.session.get(User, s.partner_id) if s.partner_id else None
            names = [n.fullname for n in (learner, partner) if n]
        result.append({
            'id': s.id,
            'mode': s.mode,
            'subject': s.subject,
            'topic': s.topic,
            'participantNames': names,
            'startedAt': s.started_at.isoformat(),
            'endedAt': s.ended_at.isoformat() if s.ended_at else None,
        })
    return jsonify(sessions=result)


@admin_bp.get('/sessions/<int:session_id>/messages')
@jwt_required()
def admin_session_messages(session_id):
    denied = _forbid_non_admin()
    if denied:
        return denied

    session = db.session.get(StudySession, session_id)
    if not session:
        return jsonify(error='Session not found.'), 404

    messages = Message.query.filter_by(session_id=session_id).order_by(Message.created_at).all()
    return jsonify(messages=[m.to_public_dict() for m in messages])


@admin_bp.get('/reports')
@jwt_required()
def list_reports():
    denied = _forbid_non_admin()
    if denied:
        return denied

    # Unreviewed first (that's the actual work queue), newest of those
    # first - already-reviewed ones trail at the end as a resolved log.
    reports = Report.query.order_by(Report.reviewed.asc(), Report.created_at.desc()).all()
    return jsonify(reports=[r.to_public_dict() for r in reports])


@admin_bp.post('/reports/<int:report_id>/resolve')
@jwt_required()
def resolve_report(report_id):
    denied = _forbid_non_admin()
    if denied:
        return denied

    report = db.session.get(Report, report_id)
    if not report:
        return jsonify(error='Report not found.'), 404

    report.reviewed = True
    db.session.commit()
    return jsonify(status='ok')


@admin_bp.get('/ratings')
@jwt_required()
def list_ratings():
    denied = _forbid_non_admin()
    if denied:
        return denied

    ratings = Rating.query.order_by(Rating.created_at.desc()).all()
    result = []
    for r in ratings:
        rater = db.session.get(User, r.rater_id)
        result.append({
            'id': r.id,
            'raterName': rater.fullname if rater else 'Unknown',
            'rateeName': r.ratee_name,
            'stars': r.stars,
            'badgeText': r.badge_text,
            'comment': r.comment,
            'createdAt': r.created_at.isoformat(),
        })
    return jsonify(ratings=result)


@admin_bp.delete('/ratings/<int:rating_id>')
@jwt_required()
def delete_rating(rating_id):
    denied = _forbid_non_admin()
    if denied:
        return denied

    rating = db.session.get(Rating, rating_id)
    if not rating:
        return jsonify(error='Rating not found.'), 404

    # Deliberately does NOT touch coins/diamonds already awarded from this
    # rating - just removes the rating itself (see the plan this was built
    # from for why: simpler and avoids a user's balance going negative or
    # looking wrong after the fact).
    db.session.delete(rating)
    db.session.commit()
    return jsonify(status='ok')


@admin_bp.post('/messages/<int:message_id>/delete')
@jwt_required()
def admin_delete_message(message_id):
    # Same soft-delete Message.deleted flag the real sender-only delete
    # uses (see sockets.py's 'delete_message') - just reachable by an
    # admin for ANY message, not only your own, and over plain HTTP so it
    # works straight from the read-only admin chat viewer (which never
    # joins as a real participant able to fire socket events as itself).
    denied = _forbid_non_admin()
    if denied:
        return denied

    message = db.session.get(Message, message_id)
    if not message:
        return jsonify(error='Message not found.'), 404

    message.deleted = True
    db.session.commit()
    socketio.emit('message_deleted', {'messageId': message.id}, room=f'session-{message.session_id}')
    return jsonify(status='ok')


@admin_bp.post('/announce')
@jwt_required()
def send_announcement():
    denied = _forbid_non_admin()
    if denied:
        return denied

    data = request.get_json(silent=True) or {}
    message = (data.get('message') or '').strip()
    if not message:
        return jsonify(error='Please write a message to send.'), 400

    users = User.query.all()
    for user in users:
        create_notification(user.id, 'announcement', message)

    return jsonify(status='ok', sentTo=len(users))


@admin_bp.post('/users/<int:user_id>/grant')
@jwt_required()
def grant_bonus(user_id):
    denied = _forbid_non_admin()
    if denied:
        return denied

    target = db.session.get(User, user_id)
    if not target:
        return jsonify(error='User not found.'), 404

    data = request.get_json(silent=True) or {}
    coins = int(data.get('coins') or 0)
    diamonds = int(data.get('diamonds') or 0)
    if coins <= 0 and diamonds <= 0:
        return jsonify(error='Enter a positive amount of coins or diamonds.'), 400

    target.points += coins
    target.diamonds += diamonds
    db.session.commit()

    parts = []
    if coins > 0:
        parts.append(f'+{coins} coins')
    if diamonds > 0:
        parts.append(f'+{diamonds} 💎')
    create_notification(user_id, 'bonus', f"You've received a bonus: {' and '.join(parts)}!")

    return jsonify(status='ok', user={'id': target.id, 'points': target.points, 'diamonds': target.diamonds})
