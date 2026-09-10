from flask import Blueprint, jsonify

from app.models import User

leaderboard_bp = Blueprint('leaderboard', __name__, url_prefix='/api/leaderboard')


@leaderboard_bp.get('')
def get_leaderboard():
    # Highest points first - ties broken by who joined earlier (arbitrary
    # but stable, so the order doesn't jump around between requests).
    top_users = User.query.order_by(User.points.desc(), User.created_at.asc()).limit(50).all()
    return jsonify(leaderboard=[u.to_public_dict() for u in top_users])
