# Real, time-based checks for an ACCEPTED scheduled session - same
# opportunistic pattern as weekly_recap.py/referral_nudge.py (checked on
# every /auth/me, no scheduler/cron needed for a plain Flask dev process):
#   1. The moment the scheduled time actually arrives - both sides get
#      told it's ready, instead of just quietly becoming clickable with
#      no signal at all.
#   2. If only ONE side has actually joined by ONE_SIDE_GRACE after that -
#      the appointment is cancelled and the person who showed up is told
#      why, instead of being left waiting indefinitely on Home.
#   3. If NEITHER side has joined by NEITHER_GRACE after that - the
#      appointment is cancelled for both, same reasoning.
#   (If BOTH sides join, routes/scheduled.py's join_scheduled() marks it
#   'completed' immediately - it never reaches either check above.)
# reminder_sent_at/no_show_notified_at (see models.py) each guard their own
# step from firing more than once per real appointment.

from datetime import datetime, timedelta

from app.models import ScheduledSession, HelpRequest, User, StudySession, GroupMembership
from app.notification_helpers import create_notification

# How long after the scheduled time to wait before assuming a no-show -
# matches routes/scheduled.py's own JOIN_EARLY_WINDOW reasoning: real
# people take a few minutes to actually get to their screen, this isn't
# "exactly on the second or you're late."
ONE_SIDE_GRACE = timedelta(minutes=15)  # one side joined, other didn't
NEITHER_GRACE = timedelta(minutes=20)   # nobody joined at all
# How long past its own scheduled time an open (never fulfilled) 1-on-1
# request waits before giving up - a group request never reaches here at
# all (it has its own self-join path once its time arrives, see
# requests.py's group_ready_requests), only a plain "nobody ever
# committed to teach/learn this with me" 1-on-1 ask.
REQUEST_UNMATCHED_GRACE = timedelta(minutes=20)


def maybe_send_scheduled_reminders(user):
    """Call with the current user on every /auth/me. Checks only THIS
    user's own accepted, still-upcoming-or-recent scheduled sessions -
    cheap (a handful of rows at most), and both sides get the same
    notification independently the next time EITHER of them loads the
    app, so nobody depends on the other's request happening to trigger it."""
    now = datetime.utcnow()  # naive - see weekly_recap.py's own comment for why

    upcoming = (
        ScheduledSession.query
        .filter(ScheduledSession.status == 'accepted')
        .filter((ScheduledSession.proposer_id == user.id) | (ScheduledSession.invitee_id == user.id))
        .filter(ScheduledSession.scheduled_for <= now)
        .filter(ScheduledSession.scheduled_for >= now - NEITHER_GRACE - timedelta(hours=6))
        .all()
    )

    changed = False
    for scheduled in upcoming:
        other_id = scheduled.invitee_id if user.id == scheduled.proposer_id else scheduled.proposer_id
        other = User.query.get(other_id)
        other_name = other.fullname if other else 'Someone'
        topic_label = scheduled.topic or scheduled.subject

        if scheduled.reminder_sent_at is None:
            create_notification(
                user.id, 'session_scheduled_reminder',
                f"🔔 Your {topic_label} session with {other_name} is ready to join now!",
            )
            scheduled.reminder_sent_at = now
            changed = True

        if scheduled.no_show_notified_at is not None:
            continue  # this appointment's cancel check already ran once

        elapsed = now - scheduled.scheduled_for
        both_missing = not scheduled.proposer_joined_at and not scheduled.invitee_joined_at
        one_missing = bool(scheduled.proposer_joined_at) != bool(scheduled.invitee_joined_at)

        if both_missing and elapsed >= NEITHER_GRACE:
            scheduled.status = 'cancelled'
            scheduled.no_show_notified_at = now
            changed = True
            create_notification(
                scheduled.proposer_id, 'session_scheduled_noshow',
                f"Nobody joined your {topic_label} session - it's been cancelled.",
            )
            create_notification(
                scheduled.invitee_id, 'session_scheduled_noshow',
                f"Nobody joined your {topic_label} session - it's been cancelled.",
            )

        elif one_missing and elapsed >= ONE_SIDE_GRACE:
            joined_id = scheduled.proposer_id if scheduled.proposer_joined_at else scheduled.invitee_id
            missing_id = scheduled.invitee_id if joined_id == scheduled.proposer_id else scheduled.proposer_id
            missing_user = User.query.get(missing_id)
            missing_name = missing_user.fullname if missing_user else 'The other person'
            scheduled.status = 'cancelled'
            scheduled.no_show_notified_at = now
            changed = True
            create_notification(
                joined_id, 'session_scheduled_noshow',
                f"{missing_name} didn't join, so your {topic_label} session has been cancelled.",
            )

    if changed:
        from app.extensions import db
        db.session.commit()


def maybe_cancel_unmatched_requests(user):
    """Call with the current user on every /auth/me. A 1-on-1 "Schedule for
    later" request that nobody ever fulfilled just sat open forever before
    this - REQUEST_UNMATCHED_GRACE after its own scheduled time, it's
    auto-cancelled and the poster is told, with a clear nudge to post a new
    one if they still want this."""
    now = datetime.utcnow()
    # Computed in Python, not "scheduled_for + REQUEST_UNMATCHED_GRACE" in
    # the SQL filter itself - SQLite has no reliable native DATETIME +
    # interval arithmetic, so SQLAlchemy's Column + timedelta silently
    # produced the wrong comparison and cancelled a request the INSTANT
    # its scheduled time arrived instead of REQUEST_UNMATCHED_GRACE later.
    cutoff = now - REQUEST_UNMATCHED_GRACE

    stale = (
        HelpRequest.query
        .filter(HelpRequest.user_id == user.id)
        .filter(HelpRequest.status == 'open')
        .filter(HelpRequest.mode != 'group')
        .filter(HelpRequest.scheduled_for.isnot(None))
        .filter(HelpRequest.scheduled_for <= cutoff)
        .all()
    )
    if not stale:
        return

    for r in stale:
        r.status = 'cancelled'
        create_notification(
            user.id, 'request_unmatched',
            f"Nobody was found for your {r.topic or r.subject} session - want to reschedule it?",
        )

    from app.extensions import db
    db.session.commit()


def maybe_cancel_unmatched_group_requests(user):
    """Call with the current user on every /auth/me. A group request whose
    time arrived but where nobody EVER actually joined the real group
    (interested doesn't count - see group_ready_requests) used to just sit
    'open' forever, showing an increasingly stale scheduled time to anyone
    still on the poster or interested side. Same REQUEST_UNMATCHED_GRACE
    window, past which it's cancelled and everyone with a real stake in it
    (the poster, plus anyone who said they were interested) is told."""
    from app.extensions import db
    now = datetime.utcnow()
    # Same fix as maybe_cancel_unmatched_requests's identical bug - computed
    # in Python, not as "scheduled_for + REQUEST_UNMATCHED_GRACE" inside the
    # SQL filter (SQLite has no reliable native DATETIME + interval
    # arithmetic via SQLAlchemy's Column + timedelta).
    cutoff = now - REQUEST_UNMATCHED_GRACE

    # interested_user_ids is a JSON list, not something SQLite can filter
    # by containment reliably at the SQL level (its .contains() falls back
    # to a raw text LIKE, which would also match e.g. user id 1 inside
    # "[11, 12]") - filtered in Python instead, same as group_ready_requests.
    due = (
        HelpRequest.query
        .filter(HelpRequest.mode == 'group')
        .filter(HelpRequest.status == 'open')
        .filter(HelpRequest.scheduled_for.isnot(None))
        .filter(HelpRequest.scheduled_for <= cutoff)
        .all()
    )
    candidates = [
        r for r in due
        if r.user_id == user.id or user.id in (r.interested_user_ids or [])
    ]
    if not candidates:
        return

    changed = False
    for r in candidates:
        # "Nobody ever joined" - a real group session for this exact
        # subject/topic with at least one current member would mean it
        # DID happen; only cancel when that's genuinely never occurred.
        has_real_group = (
            StudySession.query
            .join(GroupMembership, GroupMembership.session_id == StudySession.id)
            .filter(StudySession.mode == 'group')
            .filter(StudySession.ended_at.is_(None))
            .filter(db.func.lower(StudySession.subject) == (r.subject or '').lower())
            .filter(db.func.lower(StudySession.topic) == (r.topic or '').lower())
            .first()
        )
        if has_real_group:
            continue

        r.status = 'cancelled'
        changed = True
        topic_label = r.topic or r.subject
        for recipient_id in {r.user_id, *(r.interested_user_ids or [])}:
            create_notification(
                recipient_id, 'request_unmatched',
                f"Nobody joined the {topic_label} group session - want to reschedule it?",
            )

    if changed:
        db.session.commit()
