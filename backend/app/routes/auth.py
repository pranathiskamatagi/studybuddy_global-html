import os
import secrets
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, current_app
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity

from app.extensions import db
from app.models import User, PasswordResetCode
from app.mailer import email_is_configured, send_email
from app.gamification import REFERRAL_BONUS_COINS
from app.notification_helpers import create_notification
from app.security import record_login_device, login_locked, note_failed_login, clear_failed_logins
from app.weekly_recap import maybe_send_weekly_recap
from app.referral_nudge import maybe_send_referral_nudge
from app.scheduled_reminders import (
    maybe_send_scheduled_reminders,
    maybe_cancel_unmatched_requests,
    maybe_cancel_unmatched_group_requests,
)

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

    # An invite link - see users.py's referral endpoint for how it's
    # generated - carries the inviter's real user id. Only a real,
    # existing account counts; a stale/bad id just means no referral
    # bonus, not a signup failure.
    referred_by_id = None
    raw_ref = data.get('referredBy')
    if raw_ref:
        try:
            referrer = db.session.get(User, int(raw_ref))
            if referrer:
                referred_by_id = referrer.id
        except (TypeError, ValueError):
            pass

    user = User(
        fullname=fullname,
        email=email,
        password_hash=generate_password_hash(password),
        country=country,
        grade=grade,
        referred_by_id=referred_by_id,
    )
    if referred_by_id:
        user.points += REFERRAL_BONUS_COINS
    db.session.add(user)
    db.session.commit()

    if referred_by_id:
        referrer = db.session.get(User, referred_by_id)
        referrer.points += REFERRAL_BONUS_COINS
        db.session.commit()
        create_notification(
            referred_by_id,
            'referral',
            f"{fullname} joined using your invite - you both got +{REFERRAL_BONUS_COINS} coins!",
        )

    send_email(
        user.email,
        'Welcome to Learnora',
        f"Hi {fullname},\n\nWelcome to Learnora - Learn. Teach. Grow together.\n\n"
        "Your account is ready. Log in any time to find a study buddy, teach what you know, "
        "and earn coins and badges along the way.\n\nHappy learning!\nThe Learnora team",
    )
    record_login_device(user, data)
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

    if login_locked(email):
        return jsonify(error='Too many wrong attempts. Please wait 10 minutes and try again.'), 429

    user = User.query.filter_by(email=email).first()

    # check_password_hash returns False safely if user is None-derived
    # garbage, but we still guard explicitly so the error message is right.
    if not user or not check_password_hash(user.password_hash, password):
        note_failed_login(email)
        return jsonify(error='Incorrect email or password.'), 401
    clear_failed_logins(email)

    if user.is_banned:
        return jsonify(error='This account has been suspended.'), 403

    record_login_device(user, data)
    token = create_access_token(identity=str(user.id))
    return jsonify(token=token, user=user.to_public_dict())


RESET_CODE_LIFETIME = timedelta(minutes=10)
RESET_MAX_ATTEMPTS = 5
RESET_MAX_REQUESTS_PER_HOUR = 3


@auth_bp.post('/forgot-password')
def forgot_password():
    # Step 1: email a one-time code to the address on the account. The
    # answer is identical whether or not the email is registered, so this
    # can't be used to find out who has an account.
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify(error='Please enter your email address.'), 400

    if not email_is_configured() and os.environ.get('FLASK_DEBUG', '1') != '1':
        return jsonify(error="Password reset by email isn't available right now. Please contact support."), 503

    ok = jsonify(status='ok', message='If that email has an account, a code is on its way.')
    user = User.query.filter_by(email=email).first()
    if not user:
        return ok

    now = datetime.utcnow()
    recent = PasswordResetCode.query.filter(
        PasswordResetCode.user_id == user.id,
        PasswordResetCode.created_at >= now - timedelta(hours=1),
    ).count()
    if recent >= RESET_MAX_REQUESTS_PER_HOUR:
        return jsonify(error='Too many requests. Please try again in an hour.'), 429

    code = f'{secrets.randbelow(1_000_000):06d}'
    db.session.add(PasswordResetCode(
        user_id=user.id,
        code_hash=generate_password_hash(code),
        expires_at=now + RESET_CODE_LIFETIME,
    ))
    db.session.commit()

    if email_is_configured():
        send_email(
            user.email,
            'Your Learnora password reset code',
            f"Your Learnora code is {code}.\n\nIt works for 10 minutes. "
            "If you didn't ask to reset your password, you can ignore this email.",
        )
    else:
        # Local development only (checked above): no mail server, so the
        # code is shown in the backend's own console instead.
        current_app.logger.warning('DEV ONLY - password reset code for %s: %s', user.email, code)
    return ok


@auth_bp.post('/reset-password')
def reset_password():
    # Step 2: the emailed code + the new password.
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    code = (data.get('code') or '').strip()
    new_password = data.get('new_password') or ''

    if not email or not code or not new_password:
        return jsonify(error='Email, code and new password are required.'), 400
    if len(new_password) < 8:
        return jsonify(error='New password must be at least 8 characters.'), 400

    invalid = jsonify(error='That code is wrong or has expired. Request a new one.')
    user = User.query.filter_by(email=email).first()
    if not user:
        return invalid, 400

    now = datetime.utcnow()
    record = (
        PasswordResetCode.query
        .filter_by(user_id=user.id, used=False)
        .order_by(PasswordResetCode.created_at.desc())
        .first()
    )
    if not record or record.expires_at < now or record.attempts >= RESET_MAX_ATTEMPTS:
        return invalid, 400

    if not check_password_hash(record.code_hash, code):
        record.attempts += 1
        db.session.commit()
        return invalid, 400

    record.used = True
    user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    create_notification(
        user.id, 'security_alert',
        "Your password was just changed. If this wasn't you, contact support right away.",
    )
    send_email(
        user.email,
        'Your Learnora password was changed',
        "Your Learnora password was just changed. If this wasn't you, please contact support right away.",
    )
    return jsonify(status='ok')


@auth_bp.get('/me')
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    if not user:
        return jsonify(error='User not found.'), 404
    maybe_send_weekly_recap(user)
    maybe_send_referral_nudge(user)
    maybe_send_scheduled_reminders(user)
    maybe_cancel_unmatched_requests(user)
    maybe_cancel_unmatched_group_requests(user)
    return jsonify(user=user.to_public_dict())
