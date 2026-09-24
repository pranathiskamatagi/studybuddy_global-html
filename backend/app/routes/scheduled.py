from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import User, ScheduledSession, HelpRequest
from app.notification_helpers import create_notification

from app.scheduled_reminders import find_duplicate_scheduled

scheduled_bp = Blueprint('scheduled', __name__, url_prefix='/api/scheduled')

# How early someone's allowed to actually click Join before the exact
# scheduled second - without this, "meet at 6:00pm" would require clicking
# at the literal instant, which nobody does in practice.
JOIN_EARLY_WINDOW = timedelta(minutes=10)


@scheduled_bp.get('')
@jwt_required()
def list_scheduled():
    my_id = int(get_jwt_identity())
    mine = (
        ScheduledSession.query
        .filter(db.or_(ScheduledSession.proposer_id == my_id, ScheduledSession.invitee_id == my_id))
        .filter(ScheduledSession.status.in_(['pending', 'accepted']))
        .order_by(ScheduledSession.scheduled_for.asc())
        .all()
    )
    return jsonify(scheduled=[s.to_public_dict() for s in mine])


@scheduled_bp.post('')
@jwt_required()
def propose_scheduled():
    my_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    invitee_id = data.get('inviteeId')
    subject = (data.get('subject') or '').strip()
    topic = (data.get('topic') or '').strip()
    mode = data.get('mode') or 'learn'
    scheduled_for_raw = data.get('scheduledFor')  # ISO string, from a <input type="datetime-local">
    # Set only by choose-subject.html/teaching-tips.html's "Schedule for
    # later -> pick a specific person" flow (as opposed to two people who
    # already know each other scheduling directly) - see decline_scheduled().
    open_to_others = bool(data.get('openToOthers'))

    if not invitee_id or int(invitee_id) == my_id:
        return jsonify(error='A real, different person to invite is required.'), 400
    if not subject or not scheduled_for_raw:
        return jsonify(error='A subject and a real time are required.'), 400

    invitee = db.session.get(User, int(invitee_id))
    if not invitee:
        return jsonify(error='User not found.'), 404

    try:
        scheduled_for = datetime.fromisoformat(scheduled_for_raw)
        if scheduled_for.tzinfo is None:
            scheduled_for = scheduled_for.replace(tzinfo=timezone.utc)
    except ValueError:
        return jsonify(error='Invalid date/time.'), 400

    if scheduled_for <= datetime.now(timezone.utc):
        return jsonify(error='Pick a real time in the future.'), 400

    if find_duplicate_scheduled(my_id, int(invitee_id), scheduled_for):
        return jsonify(error='You already have a session with them at that time.'), 409

    proposer = db.session.get(User, my_id)
    scheduled = ScheduledSession(
        proposer_id=my_id,
        invitee_id=int(invitee_id),
        subject=subject,
        topic=topic or None,
        mode=mode,
        scheduled_for=scheduled_for,
        open_to_others=open_to_others,
    )
    db.session.add(scheduled)
    db.session.commit()

    create_notification(
        int(invitee_id),
        'session_scheduled',
        f"{proposer.fullname} wants to schedule a {subject} session with you.",
    )

    return jsonify(scheduled=scheduled.to_public_dict())


def _get_mine(scheduled_id, my_id):
    scheduled = db.session.get(ScheduledSession, scheduled_id)
    if not scheduled or my_id not in (scheduled.proposer_id, scheduled.invitee_id):
        return None
    return scheduled


@scheduled_bp.post('/<int:scheduled_id>/accept')
@jwt_required()
def accept_scheduled(scheduled_id):
    my_id = int(get_jwt_identity())
    scheduled = _get_mine(scheduled_id, my_id)
    if not scheduled or scheduled.invitee_id != my_id:
        return jsonify(error='Not found.'), 404
    if scheduled.status != 'pending':
        return jsonify(error='This invite is no longer pending.'), 400

    scheduled.status = 'accepted'
    db.session.commit()

    invitee = db.session.get(User, my_id)
    create_notification(
        scheduled.proposer_id,
        'session_scheduled_accepted',
        f"{invitee.fullname} accepted your scheduled {scheduled.subject} session.",
    )
    return jsonify(scheduled=scheduled.to_public_dict())


@scheduled_bp.post('/<int:scheduled_id>/decline')
@jwt_required()
def decline_scheduled(scheduled_id):
    my_id = int(get_jwt_identity())
    scheduled = _get_mine(scheduled_id, my_id)
    if not scheduled or scheduled.invitee_id != my_id:
        return jsonify(error='Not found.'), 404
    if scheduled.status != 'pending':
        return jsonify(error='This invite is no longer pending.'), 400

    scheduled.status = 'declined'

    invitee = db.session.get(User, my_id)
    create_notification(
        scheduled.proposer_id,
        'session_scheduled_declined',
        f"{invitee.fullname} can't make the scheduled {scheduled.subject} session.",
    )

    # This came from "Schedule for later -> pick a specific person," not
    # two friends arranging their own session - a decline here means the
    # ORIGINAL ask (a real open topic/time) is still real, just without
    # that one person. Re-opens it as a real community request so anyone
    # else can still take it - same as if they'd never picked a specific
    # person in the first place.
    if scheduled.open_to_others:
        reopened = HelpRequest(
            user_id=scheduled.proposer_id,
            mode=scheduled.mode,
            subject=scheduled.subject,
            topic=scheduled.topic,
            scheduled_for=scheduled.scheduled_for,
        )
        db.session.add(reopened)

        # Only a "wants to LEARN" ask has a real pool to directly notify -
        # people who've self-tagged as teaching this in Edit Profile.
        # There's no equivalent "wants to learn X" self-tag to search the
        # other way, so a "wants to TEACH" ask just relies on the
        # reopened request above being visible on the community list.
        if scheduled.mode == 'learn':
            subject_lower = (scheduled.subject or '').lower()
            topic_lower = (scheduled.topic or '').lower()
            candidates = (
                User.query
                .filter(User.id.notin_({scheduled.proposer_id, my_id}))
                .filter(User.teaches_subjects.isnot(None))
                .all()
            )
            proposer = db.session.get(User, scheduled.proposer_id)
            for candidate in candidates:
                tags = [t.lower() for t in (candidate.teaches_subjects or [])]
                if any(subject_lower in t or (topic_lower and topic_lower in t) for t in tags):
                    create_notification(
                        candidate.id, 'teach_request',
                        f"{proposer.fullname if proposer else 'Someone'} still needs a teacher for "
                        f"{scheduled.topic or scheduled.subject} - want to help?",
                    )

    db.session.commit()
    return jsonify(scheduled=scheduled.to_public_dict())


@scheduled_bp.post('/<int:scheduled_id>/cancel')
@jwt_required()
def cancel_scheduled(scheduled_id):
    my_id = int(get_jwt_identity())
    scheduled = _get_mine(scheduled_id, my_id)
    if not scheduled:
        return jsonify(error='Not found.'), 404
    if scheduled.status not in ('pending', 'accepted'):
        return jsonify(error='This can no longer be cancelled.'), 400

    scheduled.status = 'cancelled'
    db.session.commit()

    other_id = scheduled.invitee_id if my_id == scheduled.proposer_id else scheduled.proposer_id
    canceller = db.session.get(User, my_id)
    create_notification(
        other_id,
        'session_scheduled_cancelled',
        f"{canceller.fullname} cancelled the scheduled {scheduled.subject} session.",
    )
    return jsonify(scheduled=scheduled.to_public_dict())


@scheduled_bp.post('/<int:scheduled_id>/join')
@jwt_required()
def join_scheduled(scheduled_id):
    # Doesn't create the real StudySession itself - just confirms it's a
    # real, accepted, DUE appointment and hands back what the frontend
    # needs to send this person into session.html, which already knows how
    # to create/reuse a real session from those same params (see
    # match-found.js's Start Session button for the identical pattern).
    my_id = int(get_jwt_identity())
    scheduled = _get_mine(scheduled_id, my_id)
    if not scheduled:
        return jsonify(error='Not found.'), 404
    if scheduled.status != 'accepted':
        return jsonify(error='This session was never accepted.'), 400
    # SQLite silently drops the timezone marker from a stored datetime
    # (same gotcha timeAgo() already works around elsewhere) - scheduled_for
    # comes back NAIVE even though it was saved as real UTC, so this
    # compares it against naive UTC "now" instead of an aware one.
    if datetime.utcnow() < scheduled.scheduled_for - JOIN_EARLY_WINDOW:
        return jsonify(error='not_yet', scheduledFor=scheduled.scheduled_for.isoformat() + 'Z'), 409

    other_id = scheduled.invitee_id if my_id == scheduled.proposer_id else scheduled.proposer_id
    other = db.session.get(User, other_id)
    if not other:
        return jsonify(error='Not found.'), 404

    # Records that THIS side has genuinely clicked Join (not just that the
    # appointment was due) - scheduled_reminders.py uses this to tell apart
    # "nobody joined" from "only one side joined" for the auto-cancel rules.
    # Once both have, the appointment's whole job is done - no need to wait
    # for anything else before it drops off both people's "ready to join"
    # list on Home.
    if my_id == scheduled.proposer_id:
        scheduled.proposer_joined_at = datetime.utcnow()
    else:
        scheduled.invitee_joined_at = datetime.utcnow()
    if scheduled.proposer_joined_at and scheduled.invitee_joined_at:
        scheduled.status = 'completed'
    db.session.commit()

    # My role is the proposer's own `mode` if I'M the proposer, otherwise
    # the opposite (same convention as matching.py's opposite_mode).
    my_mode = scheduled.mode if my_id == scheduled.proposer_id else ('teach' if scheduled.mode == 'learn' else 'learn')

    return jsonify(
        partnerId=other.id,
        partnerName=other.fullname,
        partnerCountry=other.country,
        subject=scheduled.subject,
        topic=scheduled.topic or '',
        mode=my_mode,
    )
