from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import Block, User

blocks_bp = Blueprint('blocks', __name__, url_prefix='/api/blocks')


@blocks_bp.get('')
@jwt_required()
def list_blocks():
    user_id = int(get_jwt_identity())
    blocks = (
        Block.query
        .filter_by(blocker_id=user_id)
        .order_by(Block.created_at.desc())
        .all()
    )
    return jsonify(blocks=[b.to_public_dict() for b in blocks])


@blocks_bp.post('')
@jwt_required()
def create_block():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    blocked_id = data.get('user_id')

    if not blocked_id or blocked_id == user_id:
        return jsonify(error='A real, different user_id is required.'), 400
    if not db.session.get(User, blocked_id):
        return jsonify(error='That user does not exist.'), 404

    # Idempotent - clicking Block twice (or on someone already blocked)
    # shouldn't error, just confirm the (already-true) end state.
    existing = Block.query.filter_by(blocker_id=user_id, blocked_id=blocked_id).first()
    if not existing:
        block = Block(blocker_id=user_id, blocked_id=blocked_id)
        db.session.add(block)
        db.session.commit()
        existing = block

    return jsonify(block=existing.to_public_dict()), 201


@blocks_bp.delete('/<int:blocked_id>')
@jwt_required()
def remove_block(blocked_id):
    user_id = int(get_jwt_identity())
    block = Block.query.filter_by(blocker_id=user_id, blocked_id=blocked_id).first()
    if not block:
        return jsonify(error='Not blocked.'), 404

    db.session.delete(block)
    db.session.commit()
    return jsonify(status='ok')
