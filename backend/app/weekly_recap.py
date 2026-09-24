# A real weekly digest notification - "you studied N times, taught M
# people, earned P coins this week" - built entirely from data this app
# already tracks (StudySession/Rating), not a new counter to keep in sync.
# There's no scheduler/cron in this project (a plain Flask dev process), so
# this runs opportunistically instead: checked once whenever GET /auth/me
# is called (every page load that shows the signed-in user), which is
# cheap to check and self-heals even if the app was closed for a while.

from datetime import datetime, timedelta

from app.extensions import db
from app.models import StudySession, GroupMembership, Rating
from app.gamification import POINTS_FOR_LEARN, POINTS_FOR_TEACH, POINTS_FOR_RATING_SOMEONE
from app.notification_helpers import create_notification

RECAP_INTERVAL = timedelta(days=7)


def maybe_send_weekly_recap(user):
    """Call with the current user on every /auth/me. Does nothing (fast,
    one cheap timestamp check) unless a real week has actually passed
    since the last recap - and even then, only sends one if there's
    genuinely something real to report, never an empty "you did nothing"
    notification."""
    # datetime.utcnow() (naive), not utcnow() from models.py (aware) -
    # SQLite silently drops the timezone marker from a stored datetime, so
    # last_recap_sent_at/created_at come back NAIVE even though they were
    # saved as real UTC. Comparing against an aware "now" crashes with
    # "can't subtract offset-naive and offset-aware datetimes" - same
    # gotcha already hit (and fixed the same way) in routes/scheduled.py.
    now = datetime.utcnow()
    if user.last_recap_sent_at and now - user.last_recap_sent_at < RECAP_INTERVAL:
        return
    # A brand-new account's first check shouldn't fire immediately - give
    # them a real week before the first recap is even possible.
    since = user.last_recap_sent_at or user.created_at
    if now - since < RECAP_INTERVAL:
        return

    window_start = now - RECAP_INTERVAL

    solo_sessions = (
        StudySession.query
        .filter(db.or_(StudySession.learner_id == user.id, StudySession.partner_id == user.id))
        .filter(StudySession.ended_at.isnot(None))
        .filter(StudySession.ended_at >= window_start)
        .filter(StudySession.minutes.isnot(None))
        .all()
    )
    group_session_ids = [m.session_id for m in GroupMembership.query.filter_by(user_id=user.id).all()]
    group_sessions = []
    if group_session_ids:
        group_sessions = (
            StudySession.query
            .filter(StudySession.id.in_(group_session_ids))
            .filter(StudySession.ended_at.isnot(None))
            .filter(StudySession.ended_at >= window_start)
            .filter(StudySession.minutes.isnot(None))
            .all()
        )

    session_count = 0
    points_earned = 0
    taught_ids = set()
    for s in solo_sessions + group_sessions:
        session_count += 1
        # learner_id is whose points this session counted for - only that
        # side actually earned the fixed per-mode amount.
        if s.learner_id == user.id:
            points_earned += POINTS_FOR_TEACH if s.mode == 'teach' else POINTS_FOR_LEARN
        if s.mode == 'teach' and s.partner_id:
            taught_ids.add(s.partner_id)

    ratings_given = (
        Rating.query
        .filter(Rating.rater_id == user.id)
        .filter(Rating.created_at >= window_start)
        .count()
    )
    points_earned += ratings_given * POINTS_FOR_RATING_SOMEONE

    # Always mark the check as done, even with nothing to report - avoids
    # re-computing this same empty result on every single page load for
    # someone who's taken a break from the app.
    user.last_recap_sent_at = now

    if session_count == 0:
        db.session.commit()
        return

    parts = [f"you studied {session_count} time{'s' if session_count != 1 else ''}"]
    if taught_ids:
        parts.append(f"taught {len(taught_ids)} {'person' if len(taught_ids) == 1 else 'people'}")
    if points_earned:
        parts.append(f"earned {points_earned} coins")
    message = f"This week {', '.join(parts)}. Keep it up!"

    create_notification(user.id, 'weekly_recap', message)
    db.session.commit()
