from datetime import datetime, timedelta
# One place that creates a notification AND pushes it live - every route
# that needs to notify someone calls this instead of duplicating both
# steps (save the row, emit it) everywhere a notification might happen.
from app.extensions import db, socketio
from app.models import Notification, User

# Maps every Notification.type string used anywhere in the app to one of
# push.py's NOTIFICATION_CATEGORIES - the single place that decision
# lives, so a route creating a notification never has to know or care
# about push at all (see create_notification below). A type missing here
# defaults to 'announcements' (the safest "probably worth seeing" bucket)
# rather than silently never pushing for it.
_TYPE_TO_CATEGORY = {
    'session_invite': 'matches',
    'teach_request': 'matches',
    'group_joined': 'matches',
    'group_request_interested': 'matches',
    'quiz_challenge': 'matches',
    'quiz_challenge_result': 'matches',
    'quiz_challenge_reward': 'rewards',
    'session_scheduled': 'scheduled',
    'session_scheduled_accepted': 'scheduled',
    'session_scheduled_declined': 'scheduled',
    'session_scheduled_cancelled': 'scheduled',
    'session_scheduled_reminder': 'scheduled',
    'session_scheduled_matched': 'scheduled',
    'session_scheduled_noshow': 'scheduled',
    'request_unmatched': 'scheduled',
    'rating': 'rewards',
    'bonus': 'rewards',
    'achievement': 'rewards',
    'weekly_recap': 'rewards',
    'referral': 'rewards',
    'referral_nudge': 'rewards',
    'streak_milestone': 'rewards',
    'admin_cancelled': 'announcements',
    'announcement': 'announcements',
    'safety_warning': 'announcements',
    'security_alert': 'announcements',
}

# A short, human title per category - shown as the push notification's
# bold headline, separate from the actual message as its body text.
_CATEGORY_TITLE = {
    'messages': 'New message',
    'matches': 'Match found',
    'scheduled': 'Scheduled session',
    'rewards': 'Learnora',
    'announcements': 'Learnora',
}


DUPLICATE_WINDOW = timedelta(minutes=5)


def create_notification(user_id, type, message, session_id=None):
    # The exact same notification, to the same person, within a few
    # minutes is never useful - it just means something upstream ran
    # twice (e.g. two identical bookings). Return the one already there
    # instead of adding (and pushing) a second copy.
    recent = (
        Notification.query
        .filter_by(user_id=user_id, type=type, message=message, session_id=session_id)
        .filter(Notification.created_at >= datetime.utcnow() - DUPLICATE_WINDOW)
        .first()
    )
    if recent:
        return recent

    notification = Notification(user_id=user_id, type=type, message=message, session_id=session_id)
    db.session.add(notification)
    db.session.commit()

    # Pushes to EVERY connection that user currently has open, on
    # whichever page(s) they're on - see sockets.py's 'connect' handler,
    # which joins a personal 'user-<id>' room for exactly this purpose.
    # If they're not connected right now, this simply reaches no one -
    # the notification is still saved, and shows up next time they check.
    socketio.emit('new_notification', notification.to_public_dict(), room=f'user-{user_id}')

    # Real phone push - reaches them even with the app fully closed. See
    # push.py for why this is always best-effort/never raises.
    from app.push import send_push_to_user  # deferred - avoids a circular import at module load
    user = db.session.get(User, user_id)
    if user:
        category = _TYPE_TO_CATEGORY.get(type, 'announcements')
        url = f'/session.html?sessionId={session_id}' if session_id else '/notifications.html'
        send_push_to_user(user, category, _CATEGORY_TITLE.get(category, 'Learnora'), message, url=url)

    return notification
