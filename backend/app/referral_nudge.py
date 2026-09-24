# A one-time nudge about the referral feature (Profile > Invite a
# friend) - it's real and working, but easy to never notice since it
# only ever lived as one row in a menu. Same opportunistic pattern as
# weekly_recap.py: checked cheaply on every /auth/me, no scheduler
# needed. Sent at most ONCE per account, ever - checked by whether a
# 'referral_nudge' notification already exists, not a new column.

from datetime import datetime, timedelta

from app.models import Notification, User
from app.notification_helpers import create_notification

# A brand-new account's very first /auth/me shouldn't fire this
# immediately - give them a real day to find their footing first.
NUDGE_DELAY = timedelta(days=1)


def maybe_send_referral_nudge(user):
    now = datetime.utcnow()  # naive - see weekly_recap.py's own comment for why
    if now - user.created_at < NUDGE_DELAY:
        return

    already_sent = Notification.query.filter_by(user_id=user.id, type='referral_nudge').first()
    if already_sent:
        return

    # Someone who's ALREADY invited a friend clearly knows this feature
    # exists - no point nudging them about it.
    already_referred_someone = User.query.filter_by(referred_by_id=user.id).first() is not None
    if already_referred_someone:
        return

    create_notification(
        user.id,
        'referral_nudge',
        "Know someone who'd like StudyBuddy Global? Invite them from Profile and you'll both get bonus coins!",
    )
