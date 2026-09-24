# "Someone logged in from a new device" alerts.
import hashlib
import re
import time

from flask import request

from app.extensions import db
from app.models import LoginDevice, utcnow
from app.notification_helpers import create_notification
from app.mailer import send_email


def _describe_device(user_agent):
    ua = user_agent or ''
    if 'Edg/' in ua:
        browser = 'Edge'
    elif 'OPR/' in ua or 'Opera' in ua:
        browser = 'Opera'
    elif 'Chrome/' in ua:
        browser = 'Chrome'
    elif 'Firefox/' in ua:
        browser = 'Firefox'
    elif 'Safari/' in ua:
        browser = 'Safari'
    else:
        browser = 'a browser'
    if 'Android' in ua:
        system = 'Android'
    elif 'iPhone' in ua or 'iPad' in ua:
        system = 'iOS'
    elif 'Windows' in ua:
        system = 'Windows'
    elif 'Mac OS' in ua:
        system = 'Mac'
    elif 'Linux' in ua:
        system = 'Linux'
    else:
        system = 'an unknown device'
    return f'{browser} on {system}'


def record_login_device(user, data):
    """Call right after a successful login/signup. Remembers the device,
    and - only if this account already had other known devices - tells
    the account owner about the new one. The very first device an account
    ever uses is just recorded silently (nothing to compare it against)."""
    user_agent = request.headers.get('User-Agent', '')
    raw_id = (data.get('deviceId') or '').strip()
    if re.fullmatch(r'[A-Za-z0-9-]{8,64}', raw_id):
        device_id = raw_id
    else:
        # An old cached page that doesn't send an id yet - fall back to
        # something stable about the browser instead of alerting every time.
        device_id = 'ua-' + hashlib.sha256(user_agent.encode()).hexdigest()[:32]

    known = LoginDevice.query.filter_by(user_id=user.id).all()
    existing = next((d for d in known if d.device_id == device_id), None)
    if existing:
        existing.last_seen = utcnow()
        db.session.commit()
        return

    description = _describe_device(user_agent)
    db.session.add(LoginDevice(user_id=user.id, device_id=device_id, description=description))
    db.session.commit()

    if known:
        create_notification(
            user.id, 'security_alert',
            f"New login to your account from {description}. If this wasn't you, change your password right away.",
        )
        send_email(
            user.email,
            'New login to your Learnora account',
            f"Your Learnora account was just logged into from {description}.\n\n"
            "If this was you, no action is needed. If it wasn't, change your password "
            "right away (Settings > Change password) and contact support.",
        )


# Slows down someone guessing passwords: after MAX_FAILED_LOGINS wrong
# passwords for one email from one address, further tries are refused for
# LOGIN_LOCK_SECONDS. Kept in memory (fine for a single server process).
MAX_FAILED_LOGINS = 5
LOGIN_LOCK_SECONDS = 10 * 60
_failed_logins = {}


def _login_key(email):
    forwarded = request.headers.get('X-Forwarded-For', '').split(',')[0].strip()
    return f'{email}|{forwarded or request.remote_addr}'


def login_locked(email):
    key = _login_key(email)
    attempts = [t for t in _failed_logins.get(key, []) if time.time() - t < LOGIN_LOCK_SECONDS]
    _failed_logins[key] = attempts
    return len(attempts) >= MAX_FAILED_LOGINS


def note_failed_login(email):
    _failed_logins.setdefault(_login_key(email), []).append(time.time())


def clear_failed_logins(email):
    _failed_logins.pop(_login_key(email), None)
