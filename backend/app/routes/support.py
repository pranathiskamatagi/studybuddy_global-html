from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import SupportMessage
from app.admin_helpers import current_user_is_admin

support_bp = Blueprint('support', __name__, url_prefix='/api/support')


@support_bp.post('')
@jwt_required()
def create_support_message():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    message = (data.get('message') or '').strip()

    if not message:
        return jsonify(error='Please describe what you need help with.'), 400

    entry = SupportMessage(user_id=user_id, message=message)
    db.session.add(entry)
    db.session.commit()

    return jsonify(status='ok'), 201


@support_bp.get('')
@jwt_required()
def list_support_messages():
    # Real admin-only now (see app/admin_helpers.py) - was temporarily open
    # to any logged-in account before the admin system existed.
    if not current_user_is_admin():
        return jsonify(error='Admin only.'), 403
    messages = SupportMessage.query.order_by(SupportMessage.created_at.desc()).all()
    return jsonify(messages=[m.to_public_dict() for m in messages])
