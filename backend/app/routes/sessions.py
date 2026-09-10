from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db, socketio
from app.models import User, StudySession, Message, GroupMembership, MessageReadState, HelpRequest
from app.gamification import award_session_points, MIN_MINUTES_FOR_POINTS
from app.notification_helpers import create_notification
from app.achievements import check_and_notify_eligible
from app.ai_summary import get_or_create_summary
from app.image_safety import check_image_data_uri, UnsafeImageError
from app.teaching_tips_check import check_and_award_teaching_tips_bonus
from google.genai import errors as genai_errors

sessions_bp = Blueprint('sessions', __name__, url_prefix='/api/sessions')

VALID_MODES = {'learn', 'teach', 'group'}


def _notify_group_joined(session, joiner_id, existing_member_ids):
    # Tells everyone who was ALREADY in the group (not the joiner
    # themselves) that someone new has arrived.
    joiner = db.session.get(User, joiner_id)
    for member_id in existing_member_ids:
        if member_id == joiner_id:
            continue
        create_notification(
            member_id,
            'group_joined',
            f"{joiner.fullname} joined your {session.topic or session.subject or 'study'} group.",
            session_id=session.id,
        )


@sessions_bp.post('')
@jwt_required()
def start_session():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    mode = data.get('mode')
    if mode not in VALID_MODES:
        return jsonify(error="mode must be one of 'learn', 'teach', 'group'"), 400

    partner_id = data.get('partner_id')
    # Used to hard-block here if the partner's socket wasn't showing as
    # connected at this EXACT instant - but that check was measuring the
    # wrong thing: a backgrounded/incognito tab (or literally any recent
    # server restart) can take a moment to reconnect even though the
    # person is genuinely right there, and a false "offline" reading
    # kicked the clicker straight into "they left, finding you someone
    # else" before the real partner ever got a chance to show up. The
    # session.js 'created' handling below (waiting-for-partner grace
    # period, same mechanism as a mid-chat disconnect) now covers a
    # GENUINELY absent partner just as well, without punishing a merely
    # slow-to-reconnect one.

    # Both people can reach Match Found for each other now (see
    # matching.py's live push + pending-match backup) - which means BOTH
    # can click "Start Session" within moments of each other, before
    # either one's own click has redirected the other away. Without this
    # check, that created TWO separate sessions, and the second one's live
    # 'session_started' push yanked whoever was already properly chatting
    # in the FIRST session over to the second one - tearing down their
    # just-joined socket, which immediately fired a spurious 'partner_left'
    # on the session they were already correctly in. Reusing whichever
    # session already exists between this exact pair makes it safe no
    # matter which side clicks first, or if both click at once.
    if mode != 'group' and partner_id:
        existing = (
            StudySession.query
            .filter(StudySession.mode != 'group')
            .filter(StudySession.ended_at.is_(None))
            .filter(
                db.or_(
                    db.and_(StudySession.learner_id == user_id, StudySession.partner_id == partner_id),
                    db.and_(StudySession.learner_id == partner_id, StudySession.partner_id == user_id),
                )
            )
            # Also scoped to the SAME subject/topic - without this, the
            # exact same two people starting a brand new conversation on a
            # totally different topic got silently dropped into whatever
            # OLD session between them happened to still be open, showing
            # (and awarding points/notifications for) the wrong topic
            # entirely. Only a genuinely matching in-progress session
            # should ever be reused.
            .filter(StudySession.subject == data.get('subject'))
            .filter(StudySession.topic == data.get('topic'))
            .order_by(StudySession.started_at.desc())
            .first()
        )
        if existing:
            # No 'session_started' push here - the OTHER person either
            # already knows (they were there when it was first created) or
            # is about to find out from THEIR OWN click reusing this same
            # row. Pushing again would just cause the exact reload/rejoin
            # cycle this fix exists to prevent.
            # created=False tells session.js not to show a "waiting for
            # them to join" state - this row already existed, so the
            # partner has already been through this same code path once.
            return jsonify(session=existing.to_public_dict(), created=False), 200

    session = StudySession(
        learner_id=user_id,
        partner_id=data.get('partner_id'),
        subject=data.get('subject'),
        topic=data.get('topic'),
        level=data.get('level'),
        mode=mode,
    )
    db.session.add(session)
    db.session.flush()  # assigns session.id, needed below, before commit

    if mode == 'group':
        db.session.add(GroupMembership(session_id=session.id, user_id=user_id))

    db.session.commit()

    # A real session actually starting means whatever this person (and,
    # for a 1-on-1, their partner) was searching for has now been found -
    # close out any of THEIR OWN still-open community requests instead of
    # leaving them sitting on Home/Connect looking active forever. Covers
    # every path that can reach here (generic subject search, a community
    # request click, the "already know who" shortcut) in one place, rather
    # than each frontend flow having to remember to call fulfill itself.
    fulfilled_user_ids = [user_id] + ([session.partner_id] if mode != 'group' and session.partner_id else [])
    for open_request in HelpRequest.query.filter(
        HelpRequest.user_id.in_(fulfilled_user_ids), HelpRequest.status == 'open'
    ).all():
        open_request.status = 'fulfilled'
        socketio.emit('request_removed', {'requestId': open_request.id})
    if fulfilled_user_ids:
        db.session.commit()

    # Let the other real person know, so they don't need to already be
    # looking at the right page to find out you're waiting to chat.
    if mode != 'group' and session.partner_id:
        learner = db.session.get(User, user_id)
        create_notification(
            session.partner_id,
            'session_invite',
            f"{learner.fullname} wants to study {session.topic or session.subject or 'something'} with you!",
            session_id=session.id,
        )
        # A real live push, not just a notification to check later - drops
        # them straight into the chat the instant this side starts it
        # (if they're actually there to receive it - session.js's
        # "waiting for X to join" grace period covers it if not), rather
        # than making them notice a notification and click it themselves.
        # 'mode' here is the LEARNER's mode - the partner's is the
        # opposite (they teach if the learner wants to learn, and vice
        # versa), same relationship matching.py uses everywhere else.
        socketio.emit('session_started', {
            'sessionId': session.id,
            'partnerId': user_id,
            'partnerName': learner.fullname,
            'partnerCountry': learner.country,
            'subject': session.subject,
            'topic': session.topic,
            'level': session.level,
            'mode': 'teach' if mode == 'learn' else 'learn',
        }, room=f'user-{session.partner_id}')

    # created=True tells session.js this is a genuinely brand-new session -
    # nobody's confirmed joining it yet, so it should show a "waiting for
    # X to join" state (the same grace-period mechanism as a mid-chat
    # disconnect) instead of assuming the partner is already there.
    return jsonify(session=session.to_public_dict(), created=True), 201


@sessions_bp.post('/<int:session_id>/end')
@jwt_required()
def end_session(session_id):
    user_id = int(get_jwt_identity())
    session = db.session.get(StudySession, session_id)

    if not session:
        return jsonify(error='Session not found.'), 404
    # Only a real participant can end it - stops someone from ending (and
    # collecting points for) a session that isn't theirs. Used to check
    # ONLY session.learner_id (whoever happened to be the one whose
    # "Start Session" click created the row) - but that's just an
    # implementation detail of who clicked first, not a meaningful
    # permission boundary; the PARTNER is just as much a real participant
    # and needs to be able to end the session too, both by clicking End
    # Session themselves and when the server auto-ends their side after
    # the OTHER person ends theirs (see sockets.py's 'partner_ended').
    if not session.has_participant(user_id):
        return jsonify(error='This is not your session.'), 403
    if session.ended_at is not None:
        return jsonify(error='This session has already ended.'), 409

    session.ended_at = datetime.now(timezone.utc)
    data = request.get_json(silent=True) or {}
    # The frontend already computes real elapsed minutes (session.js /
    # group-chat.js track sessionStartTime) - trust that over recomputing
    # it here, but fall back to 1 minute if it's missing. Both sides were
    # in the same real-time chat the whole time, so this one number is a
    # fine shared basis for both people's points below - not just the
    # caller's.
    minutes = data.get('minutes', 1)
    session.minutes = minutes

    def _mode_for(participant_id):
        # session.mode is stored from the ORIGINAL creator's (learner_id's)
        # perspective - the partner's real role is always the opposite,
        # same convention matching.py and the live-push payloads use
        # everywhere else.
        if participant_id == session.learner_id:
            return session.mode
        return 'teach' if session.mode == 'learn' else 'learn'

    ender = db.session.get(User, user_id)
    ender_diamond = award_session_points(ender, _mode_for(user_id), minutes)

    # Award the OTHER real participant their points too, right now, in
    # this SAME request - they can't make their own POST /end call after
    # this (the 409 guard above would reject it, since the row is already
    # closed), so this is their only chance to actually get credited. The
    # live push below is what lets their OWN page find out and show it,
    # instead of ending up in limbo waiting on a reconnect that isn't
    # coming (see sockets.py's 'partner_ended' - the bug this fixes).
    other_id = session.partner_id if user_id == session.learner_id else session.learner_id
    other_diamond = False
    if other_id:
        other_user = db.session.get(User, other_id)
        if other_user:
            other_diamond = award_session_points(other_user, _mode_for(other_id), minutes)

    db.session.commit()
    check_and_notify_eligible(user_id)
    if other_id:
        check_and_notify_eligible(other_id)

        socketio.emit('partner_ended', {
            'name': ender.fullname,
            'minutes': minutes,
            'diamondEarned': other_diamond,
        }, room=f'user-{other_id}')

        # A real Gemini check of what actually happened in this chat - not
        # a self-report checkbox, since there's no honest way to verify
        # "I followed these tips" from a tick-box (see
        # teaching_tips_check.py). Only worth checking for a real,
        # substantial session between two real people.
        if minutes is not None and minutes > MIN_MINUTES_FOR_POINTS:
            teacher_id = user_id if _mode_for(user_id) == 'teach' else other_id
            learner_id = other_id if teacher_id == user_id else user_id
            app_obj = current_app._get_current_object()
            socketio.start_background_task(
                _run_teaching_tips_check, app_obj, session_id, teacher_id, learner_id,
            )

    return jsonify(session=session.to_public_dict(), user=ender.to_public_dict(), diamondEarned=ender_diamond)


def _run_teaching_tips_check(app, session_id, teacher_id, learner_id):
    with app.app_context():
        check_and_award_teaching_tips_bonus(session_id, teacher_id, learner_id)


@sessions_bp.get('/<int:session_id>')
@jwt_required()
def get_session(session_id):
    # Lets a notification click rebuild a full session.html/group-chat.html
    # link from just a session_id, without session.js/group-chat.js
    # needing to change at all - the caller does the reconstruction.
    user_id = int(get_jwt_identity())
    session = db.session.get(StudySession, session_id)
    if not session:
        return jsonify(error='Session not found.'), 404
    if not session.has_participant(user_id):
        return jsonify(error='This is not your session.'), 403

    result = {'session': session.to_public_dict(), 'partner': None}
    if session.mode != 'group':
        partner_id = session.partner_id if session.learner_id == user_id else session.learner_id
        partner = db.session.get(User, partner_id) if partner_id else None
        if partner:
            result['partner'] = {'id': partner.id, 'fullname': partner.fullname, 'country': partner.country}

    return jsonify(**result)


@sessions_bp.get('/<int:session_id>/messages')
@jwt_required()
def get_messages(session_id):
    user_id = int(get_jwt_identity())
    session = db.session.get(StudySession, session_id)

    if not session:
        return jsonify(error='Session not found.'), 404
    # Same participant check the socket handlers use - only real people
    # ON this session (either side of a 1-on-1, or a group member) can
    # read its history.
    if not session.has_participant(user_id):
        return jsonify(error='This is not your session.'), 403

    messages = Message.query.filter_by(session_id=session_id).order_by(Message.created_at.asc()).all()
    return jsonify(messages=[m.to_public_dict() for m in messages])


@sessions_bp.get('/<int:session_id>/read-state')
@jwt_required()
def get_read_state(session_id):
    # The real read-tick state (see MessageReadState) for everyone ELSE in
    # this chat, as of right now - loaded once when session.js/
    # group-chat.js first open the chat, then kept live afterward via the
    # 'read_receipt' socket event (this REST call never needs to be
    # re-polled after that).
    user_id = int(get_jwt_identity())
    session = db.session.get(StudySession, session_id)
    if not session:
        return jsonify(error='Session not found.'), 404
    if not session.has_participant(user_id):
        return jsonify(error='This is not your session.'), 403

    rows = (
        MessageReadState.query
        .filter(MessageReadState.session_id == session_id)
        .filter(MessageReadState.user_id != user_id)
        .all()
    )
    return jsonify(reads=[{'userId': r.user_id, 'lastReadMessageId': r.last_read_message_id} for r in rows])


# A data: URI is roughly 4/3 the size of the raw image bytes once
# base64-encoded - this is a generous ceiling for a normal photo (a few
# MB) without letting someone upload something huge that would be slow to
# check, store, and send to the other person.
MAX_IMAGE_DATA_URI_LENGTH = 7_000_000


@sessions_bp.post('/<int:session_id>/messages/image')
@jwt_required()
def send_image_message(session_id):
    # A real image message, sent through send_message's HTTP counterpart
    # instead of the 'send_message' SOCKET event - unlike a typed message,
    # this needs to AWAIT a real Gemini safety check (see image_safety.py)
    # before the row is ever created or broadcast, which fits a normal
    # request/response call far better than blocking inside a socket
    # handler for a few seconds.
    user_id = int(get_jwt_identity())
    session = db.session.get(StudySession, session_id)
    if not session:
        return jsonify(error='Session not found.'), 404
    if not session.has_participant(user_id):
        return jsonify(error='This is not your session.'), 403

    data = request.get_json(silent=True) or {}
    image_data = data.get('imageData')
    if not image_data:
        return jsonify(error='imageData is required.'), 400
    if len(image_data) > MAX_IMAGE_DATA_URI_LENGTH:
        return jsonify(error='That image is too large to send.'), 413

    try:
        check_image_data_uri(image_data)
    except UnsafeImageError as error:
        # A real, specific reason - not stored, not sent, not shown to
        # anyone but the person who tried to send it.
        return jsonify(error=error.reason), 422
    except ValueError as error:
        return jsonify(error=str(error)), 400
    except RuntimeError as error:
        return jsonify(error=str(error)), 503
    except genai_errors.APIError as error:
        return jsonify(error=f'Could not check this image right now: {error.message}'), 502

    message = Message(session_id=session_id, sender_id=user_id, text='', image_data=image_data)
    db.session.add(message)
    db.session.commit()

    # Broadcasts to EVERYONE in the room (including the sender) - same
    # pattern as sockets.py's send_message, so both people's chats render
    # it the exact same way, through the exact same 'new_message' listener.
    socketio.emit('new_message', message.to_public_dict(), room=f'session-{session_id}')
    return jsonify(message=message.to_public_dict()), 201


@sessions_bp.post('/<int:session_id>/summary')
@jwt_required()
def generate_summary(session_id):
    # Real Gemini-generated mind map + summary from this session's actual
    # chat. Cached after the first call (see get_or_create_summary) so
    # revisiting this screen doesn't pay for a second API call.
    user_id = int(get_jwt_identity())
    session = db.session.get(StudySession, session_id)
    if not session:
        return jsonify(error='Session not found.'), 404
    # has_participant() only reflects CURRENT membership - for a group,
    # that's the wrong question here. Leaving a group deletes your
    # GroupMembership row (see leave-group), but you were still a REAL
    # part of whatever was actually discussed while you were in it - a
    # summary of that real conversation shouldn't lock you out just
    # because you've since left. Anyone who actually sent a message here
    # counts too, on top of anyone still currently in it.
    ever_participated = (
        session.has_participant(user_id)
        or Message.query.filter_by(session_id=session_id, sender_id=user_id).first() is not None
    )
    if not ever_participated:
        return jsonify(error='This is not your session.'), 403

    try:
        result = get_or_create_summary(session)
    except RuntimeError as error:
        return jsonify(error=str(error)), 503
    except genai_errors.APIError as error:
        # A real failure calling Gemini (bad/expired key, model renamed,
        # rate limit, etc.) - surface a clean message instead of a raw 500.
        return jsonify(error=f'AI request failed: {error.message}'), 502

    return jsonify(**result)


@sessions_bp.post('/join-or-create-group')
@jwt_required()
def join_or_create_group():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    subject = data.get('subject')
    topic = data.get('topic')
    level = data.get('level')

    # Look for an existing OPEN group session on the same subject+topic
    # (case-insensitive - "algebra" and "Algebra" shouldn't split into two
    # separate groups) so two people picking the same thing land together
    # instead of each getting their own private group. A group session's
    # ended_at is never actually set (leave-group just removes the
    # membership - see that route), so on its own "ended_at IS NULL" would
    # match this same never-formally-closed row FOREVER, even long after
    # everyone's left it - reusing it and dragging its whole old message
    # history into what someone reasonably expects to be a brand new group.
    # Same "still has at least one member" definition of active as
    # active-groups above - a group everyone has left isn't a real group
    # to rejoin, it's a candidate for a genuinely fresh one.
    existing = None
    if subject and topic:
        candidates = (
            StudySession.query
            .filter(StudySession.mode == 'group')
            .filter(StudySession.ended_at.is_(None))
            .filter(db.func.lower(StudySession.subject) == subject.lower())
            .filter(db.func.lower(StudySession.topic) == topic.lower())
            .order_by(StudySession.started_at.desc())
            .all()
        )
        for candidate in candidates:
            if GroupMembership.query.filter_by(session_id=candidate.id).count() > 0:
                existing = candidate
                break

    if existing:
        already_member = GroupMembership.query.filter_by(session_id=existing.id, user_id=user_id).first()
        if not already_member:
            other_member_ids = [
                m.user_id for m in GroupMembership.query.filter_by(session_id=existing.id).all()
            ]
            db.session.add(GroupMembership(session_id=existing.id, user_id=user_id))
            db.session.commit()
            _notify_group_joined(existing, user_id, other_member_ids)
        return jsonify(session=existing.to_public_dict(), created=False)

    session = StudySession(learner_id=user_id, subject=subject, topic=topic, level=level, mode='group')
    db.session.add(session)
    db.session.flush()
    db.session.add(GroupMembership(session_id=session.id, user_id=user_id))
    db.session.commit()
    return jsonify(session=session.to_public_dict(), created=True), 201


@sessions_bp.post('/<int:session_id>/join')
@jwt_required()
def join_group(session_id):
    # Simpler than join-or-create-group for this case: Home/Connect
    # already show a SPECIFIC real session's card (with its real id from
    # active-groups), so there's no need to search by subject/topic again.
    user_id = int(get_jwt_identity())
    session = db.session.get(StudySession, session_id)
    if not session or session.mode != 'group' or session.ended_at is not None:
        return jsonify(error='Session not found.'), 404

    already_member = GroupMembership.query.filter_by(session_id=session_id, user_id=user_id).first()
    if not already_member:
        other_member_ids = [m.user_id for m in GroupMembership.query.filter_by(session_id=session_id).all()]
        db.session.add(GroupMembership(session_id=session_id, user_id=user_id))
        db.session.commit()
        _notify_group_joined(session, user_id, other_member_ids)

    return jsonify(session=session.to_public_dict())


@sessions_bp.get('/active-groups')
@jwt_required()
def active_groups():
    # Open group sessions that still have at least one member - a group
    # everyone has since left isn't "active" even if nothing formally
    # closed it.
    sessions = (
        StudySession.query
        .filter(StudySession.mode == 'group')
        .filter(StudySession.ended_at.is_(None))
        .order_by(StudySession.started_at.desc())
        .limit(20)
        .all()
    )

    results = []
    for session in sessions:
        member_count = GroupMembership.query.filter_by(session_id=session.id).count()
        if member_count == 0:
            continue
        entry = session.to_public_dict()
        entry['memberCount'] = member_count
        results.append(entry)

    return jsonify(activeGroups=results)


@sessions_bp.get('/<int:session_id>/members')
@jwt_required()
def get_members(session_id):
    user_id = int(get_jwt_identity())
    session = db.session.get(StudySession, session_id)
    if not session:
        return jsonify(error='Session not found.'), 404
    if not session.has_participant(user_id):
        return jsonify(error='This is not your session.'), 403

    memberships = GroupMembership.query.filter_by(session_id=session_id).all()
    return jsonify(members=[m.to_public_dict() for m in memberships])


@sessions_bp.post('/<int:session_id>/leave-group')
@jwt_required()
def leave_group(session_id):
    user_id = int(get_jwt_identity())
    session = db.session.get(StudySession, session_id)
    if not session or session.mode != 'group':
        return jsonify(error='Session not found.'), 404

    membership = GroupMembership.query.filter_by(session_id=session_id, user_id=user_id).first()
    if not membership:
        return jsonify(error="You're not in this group."), 403

    db.session.delete(membership)

    data = request.get_json(silent=True) or {}
    minutes = data.get('minutes', 1)
    user = db.session.get(User, user_id)
    # Unlike a 1-on-1 session, leaving a group doesn't end it for everyone
    # else - it just awards YOUR points for the time YOU spent, same rule
    # as any other session (including the 10-minute minimum).
    diamond_earned = award_session_points(user, session.mode, minutes)

    db.session.commit()
    check_and_notify_eligible(user_id)

    # Tell everyone ELSE still in the group, right now - this used to
    # happen from the socket 'disconnect' handler instead, which fired on
    # ANY disconnect (a refresh, a network blip), not just a real,
    # deliberate exit. This is the one place that actually IS a real exit.
    socketio.emit('member_left', {'name': user.fullname}, room=f'session-{session_id}')

    return jsonify(user=user.to_public_dict(), diamondEarned=diamond_earned)
