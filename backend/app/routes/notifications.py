from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import Notification

notifications_bp = Blueprint('notifications', __name__, url_prefix='/api/notifications')


@notifications_bp.get('')
@jwt_required()
def list_notifications():
    user_id = int(get_jwt_identity())
    notifications = (
        Notification.query
        .filter_by(user_id=user_id)
        .order_by(Notification.created_at.desc())
        .limit(30)
        .all()
    )
    return jsonify(notifications=[n.to_public_dict() for n in notifications])


@notifications_bp.post('/<int:notification_id>/read')
@jwt_required()
def mark_read(notification_id):
    user_id = int(get_jwt_identity())
    notification = db.session.get(Notification, notification_id)
    if not notification or notification.user_id != user_id:
        return jsonify(error='Notification not found.'), 404

    notification.read = True
    db.session.commit()
    return jsonify(notification=notification.to_public_dict())


@notifications_bp.post('/read-all')
@jwt_required()
def mark_all_read():
    user_id = int(get_jwt_identity())
    Notification.query.filter_by(user_id=user_id, read=False).update({'read': True})
    db.session.commit()
    return jsonify(status='ok')


@notifications_bp.delete('/<int:notification_id>')
@jwt_required()
def delete_notification(notification_id):
    user_id = int(get_jwt_identity())
    notification = db.session.get(Notification, notification_id)
    if not notification or notification.user_id != user_id:
        return jsonify(error='Notification not found.'), 404

    db.session.delete(notification)
    db.session.commit()
    return jsonify(status='ok')


@notifications_bp.delete('')
@jwt_required()
def clear_all_notifications():
    user_id = int(get_jwt_identity())
    Notification.query.filter_by(user_id=user_id).delete()
    db.session.commit()
    return jsonify(status='ok')
