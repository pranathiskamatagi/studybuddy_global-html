from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity

from app.extensions import db
from app.models import User

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_bp.post('/signup')
def signup():
    data = request.get_json(silent=True) or {}

    fullname = (data.get('fullname') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    country = data.get('country')
    grade = data.get('grade')

    # Same rules signup.js already checks client-side (password length,
    # required fields) - checked AGAIN here because client-side checks are
    # easy to bypass (e.g. calling this API directly), so the server must
    # never trust the browser alone.
    if not fullname or not email or not password:
        return jsonify(error='fullname, email, and password are required'), 400
    if len(password) < 8:
        return jsonify(error='Password must be at least 8 characters.'), 400
    if not country or not grade:
        return jsonify(error='Please select your country and grade.'), 400

    if User.query.filter_by(email=email).first():
        return jsonify(error='An account with that email already exists.'), 409

    user = User(
        fullname=fullname,
        email=email,
        password_hash=generate_password_hash(password),
        country=country,
        grade=grade,
    )
    db.session.add(user)
    db.session.commit()

    # str(user.id) - flask-jwt-extended requires the identity to be a string.
    token = create_access_token(identity=str(user.id))
    return jsonify(token=token, user=user.to_public_dict()), 201


@auth_bp.post('/login')
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify(error='Please fill in both fields.'), 400

    user = User.query.filter_by(email=email).first()

    # check_password_hash returns False safely if user is None-derived
    # garbage, but we still guard explicitly so the error message is right.
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify(error='Incorrect email or password.'), 401

    if user.is_banned:
        return jsonify(error='This account has been suspended.'), 403

    token = create_access_token(identity=str(user.id))
    return jsonify(token=token, user=user.to_public_dict())


@auth_bp.post('/reset-password')
def reset_password():
    # The simple version of "forgot password": no email is actually sent
    # (this app has no email-sending set up yet) - just confirm the email
    # belongs to a real account, then set the new password directly. Not
    # something to rely on for real security (anyone who knows the email
    # can reset it), but a genuine improvement over the old "not built
    # yet" alert, for right now.
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    new_password = data.get('new_password') or ''

    if not email or not new_password:
        return jsonify(error='Email and new password are required.'), 400
    if len(new_password) < 8:
        return jsonify(error='New password must be at least 8 characters.'), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify(error='No account found with that email.'), 404

    user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    return jsonify(status='ok')


@auth_bp.get('/me')
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    if not user:
        return jsonify(error='User not found.'), 404
    return jsonify(user=user.to_public_dict())
