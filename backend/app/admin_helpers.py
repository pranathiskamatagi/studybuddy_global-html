from flask_jwt_extended import get_jwt_identity

from app.extensions import db
from app.models import User


def current_user_is_admin():
    """True only for the one real account with is_admin=True - never set
    through signup or any editable UI, only ever flipped directly in the
    database. Safe to call anywhere a JWT is already required."""
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    return bool(user and user.is_admin)
