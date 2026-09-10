# One place that creates a notification AND pushes it live - every route
# that needs to notify someone calls this instead of duplicating both
# steps (save the row, emit it) everywhere a notification might happen.
from app.extensions import db, socketio
from app.models import Notification


def create_notification(user_id, type, message, session_id=None):
    notification = Notification(user_id=user_id, type=type, message=message, session_id=session_id)
    db.session.add(notification)
    db.session.commit()

    # Pushes to EVERY connection that user currently has open, on
    # whichever page(s) they're on - see sockets.py's 'connect' handler,
    # which joins a personal 'user-<id>' room for exactly this purpose.
    # If they're not connected right now, this simply reaches no one -
    # the notification is still saved, and shows up next time they check.
    socketio.emit('new_notification', notification.to_public_dict(), room=f'user-{user_id}')

    return notification
