from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import User, Favorite

favorites_bp = Blueprint('favorites', __name__, url_prefix='/api/favorites')


@favorites_bp.get('')
@jwt_required()
def list_favorites():
    my_id = int(get_jwt_identity())
    favorites = Favorite.query.filter_by(user_id=my_id).order_by(Favorite.created_at.desc()).all()
    return jsonify(favorites=[f.to_public_dict() for f in favorites])


@favorites_bp.post('/<int:user_id>')
@jwt_required()
def add_favorite(user_id):
    my_id = int(get_jwt_identity())
    if user_id == my_id:
        return jsonify(error="You can't favorite yourself."), 400

    target = db.session.get(User, user_id)
    if not target:
        return jsonify(error='User not found.'), 404

    existing = Favorite.query.filter_by(user_id=my_id, favorite_id=user_id).first()
    if not existing:
        db.session.add(Favorite(user_id=my_id, favorite_id=user_id))
        db.session.commit()
    return jsonify(status='ok')


@favorites_bp.delete('/<int:user_id>')
@jwt_required()
def remove_favorite(user_id):
    my_id = int(get_jwt_identity())
    existing = Favorite.query.filter_by(user_id=my_id, favorite_id=user_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
    return jsonify(status='ok')
