# Real phone/lock-screen notifications, on top of the existing in-app
# notification bell - see notification_helpers.py, which already creates
# a Notification row and pushes it live over the socket while the app is
# OPEN. This module is the other half: reaching someone even when
# StudyBuddy isn't open at all, via the browser's own push service (the
# same mechanism behind every "real app" notification on a phone).
#
# Needs the browser tab to have registered a Service Worker (push.js) and
# been granted permission - if that never happened, this simply has no
# subscriptions to send to and quietly does nothing, same as every other
# best-effort notification in this app.

import json
from pywebpush import webpush, WebPushException

from app.config import Config
from app.extensions import db
from app.models import PushSubscription

# The small, fixed set of categories shown as toggles in Settings (see
# settings-notifications.js) - every create_notification() call is
# tagged with exactly one of these (see notification_helpers.py), and a
# person can turn each one off independently. Deliberately few and
# broad, not one toggle per notification type - a beginner user needs
# "turn off ratings and rewards," not fifteen tiny switches.
NOTIFICATION_CATEGORIES = {
    'messages',       # a new chat message while you weren't in that chat
    'matches',        # a partner found, group joined, quiz challenge
    'scheduled',      # scheduled-session invites/accepts/declines/reminders
    'rewards',        # ratings, bonuses, achievements, weekly recap
    'announcements',  # admin messages, announcements, safety warnings
}


def category_enabled(user, category):
    prefs = user.notification_prefs or {}
    # Missing = on - see User.notification_prefs's own comment for why.
    return prefs.get(category, True)


def send_push_to_user(user, category, title, body, url=None):
    """Best-effort: sends a real push to every device this person has
    granted permission on, if (a) they have any subscriptions at all and
    (b) this category isn't switched off in Settings. Never raises - a
    push failing (expired subscription, browser offline, no VAPID keys
    configured yet) should never break whatever real action triggered it."""
    if not Config.VAPID_PRIVATE_KEY or not Config.VAPID_PUBLIC_KEY:
        return
    if not category_enabled(user, category):
        return

    subscriptions = PushSubscription.query.filter_by(user_id=user.id).all()
    if not subscriptions:
        return

    payload = json.dumps({'title': title, 'body': body, 'url': url or '/home.html'})
    vapid_claims = {'sub': f'mailto:{Config.VAPID_CONTACT_EMAIL}'} if Config.VAPID_CONTACT_EMAIL else {}

    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    'endpoint': sub.endpoint,
                    'keys': {'p256dh': sub.p256dh_key, 'auth': sub.auth_key},
                },
                data=payload,
                vapid_private_key=Config.VAPID_PRIVATE_KEY,
                vapid_claims=dict(vapid_claims),
            )
        except WebPushException as error:
            # A 404/410 means the browser itself says this subscription is
            # gone for good (uninstalled, permission revoked, expired) -
            # keeping it around would just mean paying this same failure
            # forever, so clean it up. Anything else (a momentary network
            # blip) is left alone to try again next time.
            status = getattr(error.response, 'status_code', None)
            if status in (404, 410):
                db.session.delete(sub)
                db.session.commit()
        except Exception:
            # Never let a broken push take down the real action that
            # triggered it (sending a message, accepting a session, ...).
            pass
