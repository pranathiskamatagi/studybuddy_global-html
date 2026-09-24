from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.config import Config
from app.extensions import db
from app.models import Notification, User, PushSubscription
from app.push import NOTIFICATION_CATEGORIES

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


# ---------------------------------------------------------------
# Real phone push notifications - see app/push.py for the sending side
# and push.js for how the browser gets a subscription in the first place.
# ---------------------------------------------------------------

@notifications_bp.get('/push/vapid-public-key')
def get_vapid_public_key():
    # The one piece of this whole system that's genuinely public - it's
    # what the BROWSER uses (via the PushManager API) to create a
    # subscription in a way only this server's private key can later
    # address. Not JWT-protected: push.js needs it before someone's
    # necessarily logged in on a fresh device.
    return jsonify(publicKey=Config.VAPID_PUBLIC_KEY)


@notifications_bp.post('/push/subscribe')
@jwt_required()
def subscribe_push():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    endpoint = data.get('endpoint')
    keys = data.get('keys') or {}
    p256dh = keys.get('p256dh')
    auth = keys.get('auth')

    if not endpoint or not p256dh or not auth:
        return jsonify(error='A real browser subscription is required.'), 400

    # The SAME browser can end up calling this again (e.g. re-granting
    # permission after it was revoked) - the endpoint is already unique
    # per browser+origin, so just refresh whichever user it's tied to
    # rather than erroring on a duplicate.
    existing = PushSubscription.query.filter_by(endpoint=endpoint).first()
    if existing:
        existing.user_id = user_id
        existing.p256dh_key = p256dh
        existing.auth_key = auth
    else:
        db.session.add(PushSubscription(user_id=user_id, endpoint=endpoint, p256dh_key=p256dh, auth_key=auth))
    db.session.commit()
    return jsonify(status='ok'), 201


@notifications_bp.post('/push/unsubscribe')
@jwt_required()
def unsubscribe_push():
    data = request.get_json(silent=True) or {}
    endpoint = data.get('endpoint')
    if endpoint:
        PushSubscription.query.filter_by(endpoint=endpoint).delete()
        db.session.commit()
    return jsonify(status='ok')


@notifications_bp.get('/preferences')
@jwt_required()
def get_preferences():
    user = db.session.get(User, int(get_jwt_identity()))
    return jsonify(
        preferences=user.notification_prefs or {},
        pushEnabled=PushSubscription.query.filter_by(user_id=user.id).first() is not None,
    )


@notifications_bp.put('/preferences')
@jwt_required()
def update_preferences():
    user = db.session.get(User, int(get_jwt_identity()))
    data = request.get_json(silent=True) or {}
    incoming = data.get('preferences')
    if not isinstance(incoming, dict):
        return jsonify(error='A real preferences object is required.'), 400

    # Only ever store the fixed, known categories - never let an
    # unrecognized key (a typo, a stale client) quietly pile up forever.
    prefs = dict(user.notification_prefs or {})
    for category in NOTIFICATION_CATEGORIES:
        if category in incoming:
            prefs[category] = bool(incoming[category])
    user.notification_prefs = prefs
    db.session.commit()
    return jsonify(preferences=user.notification_prefs)
