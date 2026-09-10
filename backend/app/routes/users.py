from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models import User

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
