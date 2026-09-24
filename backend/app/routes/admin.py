from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func

from app.extensions import db, socketio
from app.models import User, StudySession, Message, GroupMembership, Report, Rating, Block
from app.admin_helpers import current_user_is_admin
from app.notification_helpers import create_notification

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')


def _forbid_non_admin():
    if not current_user_is_admin():
        return jsonify(error='Admin only.'), 403
    return None


@admin_bp.get('/users')
@jwt_required()
def list_users():
    denied = _forbid_non_admin()
    if denied:
        return denied

    users = User.query.order_by(User.id).all()
    return jsonify(users=[
        {
            'id': u.id,
            'fullname': u.fullname,
            'email': u.email,
            'country': u.country,
            'isAdmin': u.is_admin,
            'isBanned': u.is_banned,
            # Real gamification stats, same numbers the person themselves
            # sees on Home/Profile - lets the admin actually see what
            # someone's up to, not just who they are.
            'points': u.points,
            'diamonds': u.diamonds,
            'streak': u.current_streak_days,
            'sessionCount': u.completed_session_count,
            'rating': u.average_rating(),
        }
        for u in users
    ])


@admin_bp.get('/users/<int:user_id>/detail')
@jwt_required()
def user_detail(user_id):
    # The real "click a person, see everything" view - conversations,
    # ratings given AND received, and real activity, all in one place,
    # instead of only what admin-ratings.html happens to show. A group
    # session only shows up here while this person is STILL a member
    # (see GroupMembership - leaving one deletes the row entirely, so
    # there's no historical record of a group they've since left, only
    # 1-on-1 conversations keep a permanent record either way).
    denied = _forbid_non_admin()
    if denied:
        return denied

    user = db.session.get(User, user_id)
    if not user:
        return jsonify(error='User not found.'), 404

    solo_sessions = (
        StudySession.query
        .filter(StudySession.mode != 'group')
        .filter(db.or_(StudySession.learner_id == user_id, StudySession.partner_id == user_id))
        .order_by(StudySession.id.desc())
        .all()
    )
    group_session_ids = [m.session_id for m in GroupMembership.query.filter_by(user_id=user_id).all()]
    group_sessions = (
        StudySession.query.filter(StudySession.id.in_(group_session_ids)).order_by(StudySession.id.desc()).all()
        if group_session_ids else []
    )

    def session_row(s):
        if s.mode == 'group':
            members = GroupMembership.query.filter_by(session_id=s.id).all()
            names = [db.session.get(User, m.user_id).fullname for m in members if db.session.get(User, m.user_id)]
        else:
            other_id = s.partner_id if s.learner_id == user_id else s.learner_id
            other = db.session.get(User, other_id) if other_id else None
            names = [other.fullname] if other else []
        return {
            'id': s.id,
            'mode': s.mode,
            'subject': s.subject,
            'topic': s.topic,
            'otherNames': names,
            'startedAt': s.started_at.isoformat(),
            'endedAt': s.ended_at.isoformat() if s.ended_at else None,
        }

    conversations = sorted(
        [session_row(s) for s in solo_sessions] + [session_row(s) for s in group_sessions],
        key=lambda r: r['id'], reverse=True,
    )

    ratings_given = Rating.query.filter_by(rater_id=user_id).order_by(Rating.created_at.desc()).all()
    ratings_received = Rating.query.filter_by(ratee_id=user_id).order_by(Rating.created_at.desc()).all()

    def rating_row(r, other_is_rater):
        other_id = r.rater_id if other_is_rater else r.ratee_id
        other = db.session.get(User, other_id) if other_id else None
        return {
            'id': r.id,
            'otherName': other.fullname if other else (r.ratee_name or 'Unknown'),
            'stars': r.stars,
            'badgeText': r.badge_text,
            'comment': r.comment,
            'createdAt': r.created_at.isoformat(),
        }

    return jsonify(
        user={
            'id': user.id,
            'fullname': user.fullname,
            'email': user.email,
            'country': user.country,
            'isAdmin': user.is_admin,
            'isBanned': user.is_banned,
            'points': user.points,
            'diamonds': user.diamonds,
            'streak': user.current_streak_days,
            'longestStreak': user.longest_streak_days,
            'createdAt': user.created_at.isoformat(),
        },
        conversations=conversations,
        ratingsGiven=[rating_row(r, other_is_rater=False) for r in ratings_given],
        ratingsReceived=[rating_row(r, other_is_rater=True) for r in ratings_received],
    )


@admin_bp.post('/users/<int:user_id>/ban')
@jwt_required()
def ban_user(user_id):
    denied = _forbid_non_admin()
    if denied:
        return denied

    my_id = int(get_jwt_identity())
    target = db.session.get(User, user_id)
    if not target:
        return jsonify(error='User not found.'), 404
    if target.id == my_id:
        return jsonify(error="You can't ban yourself."), 400
    if target.is_admin:
        return jsonify(error="You can't ban another admin."), 400

    target.is_banned = True
    db.session.commit()
    return jsonify(status='ok')


@admin_bp.post('/users/<int:user_id>/unban')
@jwt_required()
def unban_user(user_id):
    denied = _forbid_non_admin()
    if denied:
        return denied

    target = db.session.get(User, user_id)
    if not target:
        return jsonify(error='User not found.'), 404

    target.is_banned = False
    db.session.commit()
    return jsonify(status='ok')


@admin_bp.get('/sessions')
@jwt_required()
def list_sessions():
    denied = _forbid_non_admin()
    if denied:
        return denied

    # Only real conversations - ones where somebody actually sent a message.
    # Every screen that creates a session (matching, resume, group joins)
    # leaves behind rows nobody ever typed in, and those piled up to
    # hundreds of blank "conversations" that filled the old 200-row cap
    # and pushed the real ones out of view. This applies to every user's
    # sessions, not any one account.
    has_messages = db.session.query(Message.session_id).distinct()
    sessions = (
        StudySession.query
        .filter(StudySession.id.in_(has_messages))
        .order_by(StudySession.id.desc())
        .limit(1000)
        .all()
    )
    result = []
    for s in sessions:
        if s.mode == 'group':
            members = GroupMembership.query.filter_by(session_id=s.id).all()
            names = [db.session.get(User, m.user_id).fullname for m in members if db.session.get(User, m.user_id)]
            if not names:
                # GroupMembership rows are removed as each person formally
                # exits (see leave_group) - once everyone has, the group has
                # no current "members" left, but the real conversation still
                # happened. Message history is never deleted, so it's what's
                # left to show who was actually in it.
                sender_ids = (
                    db.session.query(Message.sender_id)
                    .filter(Message.session_id == s.id)
                    .distinct()
                    .all()
                )
                names = [
                    db.session.get(User, sid).fullname
                    for (sid,) in sender_ids if db.session.get(User, sid)
                ]
        else:
            learner = db.session.get(User, s.learner_id)
            partner = db.session.get(User, s.partner_id) if s.partner_id else None
            names = [n.fullname for n in (learner, partner) if n]
        result.append({
            'id': s.id,
            'mode': s.mode,
            'subject': s.subject,
            'topic': s.topic,
            'participantNames': names,
            'startedAt': s.started_at.isoformat(),
            'endedAt': s.ended_at.isoformat() if s.ended_at else None,
        })
    return jsonify(sessions=result)


@admin_bp.delete('/sessions/<int:session_id>')
@jwt_required()
def delete_session(session_id):
    # A real, permanent delete - for cleaning up old/not-useful
    # conversations out of what can otherwise grow into hundreds of rows.
    # FK-safe order (same one used for test-account cleanup all session
    # long): Message/MessageReadState/GroupMembership/SessionSummary/
    # Rating all reference session_id and must go first.
    denied = _forbid_non_admin()
    if denied:
        return denied

    session_row = db.session.get(StudySession, session_id)
    if not session_row:
        return jsonify(error='Conversation not found.'), 404

    from app.models import MessageReadState, SessionSummary
    MessageReadState.query.filter_by(session_id=session_id).delete()
    Message.query.filter_by(session_id=session_id).delete()
    GroupMembership.query.filter_by(session_id=session_id).delete()
    SessionSummary.query.filter_by(session_id=session_id).delete()
    Rating.query.filter_by(session_id=session_id).delete()
    db.session.delete(session_row)
    db.session.commit()
    return jsonify(status='ok')


@admin_bp.get('/live')
@jwt_required()
def live_activity():
    # Two real, currently-happening things an admin can otherwise only see
    # after the fact: sessions genuinely in progress right now (not just
    # "recent" - ended_at is still null), and people actively on the
    # matching screen who haven't been paired with anyone yet at all (no
    # StudySession exists for them to show up in the list above).
    denied = _forbid_non_admin()
    if denied:
        return denied

    from app.sockets import get_searching_user_ids, get_online_user_ids

    online_ids = get_online_user_ids()
    ongoing = StudySession.query.filter(StudySession.ended_at.is_(None)).order_by(StudySession.id.desc()).all()
    sessions_result = []
    for s in ongoing:
        if s.mode == 'group':
            # Unlike a 1-on-1 session, a group's ended_at is NEVER set
            # (leaving just removes your own GroupMembership row - see
            # sessions.py's leave_group) - so ended_at IS NULL alone would
            # list every group session ever created, including ones
            # abandoned weeks ago with nobody left in them. A group only
            # counts as genuinely "live right now" if it still has real
            # members AND at least one of them is actually online.
            members = GroupMembership.query.filter_by(session_id=s.id).all()
            if not members:
                continue
            names = [db.session.get(User, m.user_id).fullname for m in members if db.session.get(User, m.user_id)]
            if not any(m.user_id in online_ids for m in members):
                continue
        else:
            # Same reasoning as group sessions above - a 1-on-1 that both
            # people quietly abandoned (closed the tab without clicking
            # End Session) also leaves ended_at NULL forever. Require at
            # least one real participant to actually be online.
            if s.learner_id not in online_ids and s.partner_id not in online_ids:
                continue
            learner = db.session.get(User, s.learner_id)
            partner = db.session.get(User, s.partner_id) if s.partner_id else None
            names = [n.fullname for n in (learner, partner) if n]
        sessions_result.append({
            'id': s.id,
            'mode': s.mode,
            'subject': s.subject,
            'topic': s.topic,
            'participantNames': names,
            'startedAt': s.started_at.isoformat(),
        })

    searching_result = []
    for user_id in get_searching_user_ids():
        user = db.session.get(User, user_id)
        if user:
            searching_result.append({'userId': user.id, 'fullname': user.fullname})

    return jsonify(ongoingSessions=sessions_result, searching=searching_result)


@admin_bp.post('/sessions/<int:session_id>/warn')
@jwt_required()
def warn_session(session_id):
    # A real message injected INTO a live chat, visibly attributed to
    # "Admin" (see Message.is_admin_message) - unlike admin_watch's
    # deliberately silent join (see sockets.py), this is a real,
    # participant-visible intervention, only sent when the admin chooses
    # to, never automatically.
    denied = _forbid_non_admin()
    if denied:
        return denied

    session_row = db.session.get(StudySession, session_id)
    if not session_row:
        return jsonify(error='Session not found.'), 404

    data = request.get_json(silent=True) or {}
    text = (data.get('message') or '').strip()
    if not text:
        return jsonify(error='Write a message first.'), 400

    admin_id = int(get_jwt_identity())
    message = Message(session_id=session_id, sender_id=admin_id, text=text, is_admin_message=True)
    db.session.add(message)
    db.session.commit()

    socketio.emit('new_message', message.to_public_dict(), room=f'session-{session_id}')
    return jsonify(message=message.to_public_dict())


@admin_bp.post('/sessions/<int:session_id>/cancel')
@jwt_required()
def cancel_session(session_id):
    # A forced end, distinct from delete_session() above (which erases the
    # conversation entirely) - this just closes it right now and tells
    # whoever's actually in it, live, the same way a normal "End session"
    # would show up to the OTHER side (see sockets.py/session.js's real
    # partner_ended handling) - except this comes from the admin, not
    # either participant, so it needs its own real-time signal + a real
    # Notification for whoever isn't actively looking at the chat.
    denied = _forbid_non_admin()
    if denied:
        return denied

    session_row = db.session.get(StudySession, session_id)
    if not session_row:
        return jsonify(error='Session not found.'), 404
    if session_row.ended_at:
        return jsonify(error='Already ended.'), 400

    from app.models import utcnow
    session_row.ended_at = utcnow()

    if session_row.mode == 'group':
        participant_ids = [m.user_id for m in GroupMembership.query.filter_by(session_id=session_id).all()]
    else:
        participant_ids = [pid for pid in (session_row.learner_id, session_row.partner_id) if pid]

    db.session.commit()

    socketio.emit('admin_cancelled', {'sessionId': session_id}, room=f'session-{session_id}')
    for user_id in participant_ids:
        create_notification(user_id, 'admin_cancelled', 'Admin cancelled your session.', session_id=session_id)

    return jsonify(status='ok')


@admin_bp.post('/searching/<int:user_id>/cancel')
@jwt_required()
def cancel_searching(user_id):
    # The OTHER "in progress" state worth being able to stop - someone
    # actively on the matching screen, not yet paired with anyone (so
    # there's no StudySession row for cancel_session() above to act on at
    # all). Same real-time signal + notification pattern, targeted at
    # their personal room instead of a session room.
    denied = _forbid_non_admin()
    if denied:
        return denied

    user = db.session.get(User, user_id)
    if not user:
        return jsonify(error='User not found.'), 404

    socketio.emit('admin_cancelled', {'sessionId': None}, room=f'user-{user_id}')
    create_notification(user_id, 'admin_cancelled', 'Admin cancelled your session.')
    return jsonify(status='ok')


@admin_bp.get('/sessions/<int:session_id>/messages')
@jwt_required()
def admin_session_messages(session_id):
    denied = _forbid_non_admin()
    if denied:
        return denied

    session = db.session.get(StudySession, session_id)
    if not session:
        return jsonify(error='Session not found.'), 404

    messages = Message.query.filter_by(session_id=session_id).order_by(Message.created_at).all()
    return jsonify(messages=[m.to_public_dict() for m in messages])


@admin_bp.get('/reports')
@jwt_required()
def list_reports():
    denied = _forbid_non_admin()
    if denied:
        return denied

    # Unreviewed first (that's the actual work queue), newest of those
    # first - already-reviewed ones trail at the end as a resolved log.
    reports = Report.query.order_by(Report.reviewed.asc(), Report.created_at.desc()).all()
    return jsonify(reports=[r.to_public_dict() for r in reports])


@admin_bp.post('/reports/<int:report_id>/resolve')
@jwt_required()
def resolve_report(report_id):
    denied = _forbid_non_admin()
    if denied:
        return denied

    report = db.session.get(Report, report_id)
    if not report:
        return jsonify(error='Report not found.'), 404

    report.reviewed = True
    db.session.commit()
    return jsonify(status='ok')


@admin_bp.get('/blocks')
@jwt_required()
def list_blocks():
    # Who blocked whom, and a real "keeps getting blocked by different
    # people" signal - one block could just be a personality clash, but
    # the SAME person blocked by several different real accounts is a
    # concrete pattern worth an admin actually seeing, not just a raw log.
    denied = _forbid_non_admin()
    if denied:
        return denied

    blocks = Block.query.order_by(Block.created_at.desc()).all()
    entries = []
    for b in blocks:
        blocker = db.session.get(User, b.blocker_id)
        blocked = db.session.get(User, b.blocked_id)
        entries.append({
            'id': b.id,
            'blockerId': b.blocker_id,
            'blockerName': blocker.fullname if blocker else 'Unknown',
            'blockedId': b.blocked_id,
            'blockedName': blocked.fullname if blocked else 'Unknown',
            'createdAt': b.created_at.isoformat(),
        })

    # Grouped by who's being blocked - count of DISTINCT people who've
    # blocked them, highest first, only real repeats (2+) surfaced.
    counts = (
        db.session.query(Block.blocked_id, func.count(Block.blocker_id))
        .group_by(Block.blocked_id)
        .having(func.count(Block.blocker_id) >= 2)
        .order_by(func.count(Block.blocker_id).desc())
        .all()
    )
    repeat_offenders = []
    for user_id, count in counts:
        user = db.session.get(User, user_id)
        repeat_offenders.append({
            'userId': user_id,
            'fullname': user.fullname if user else 'Unknown',
            'blockedByCount': count,
        })

    return jsonify(blocks=entries, repeatOffenders=repeat_offenders)


@admin_bp.get('/ratings')
@jwt_required()
def list_ratings():
    denied = _forbid_non_admin()
    if denied:
        return denied

    ratings = Rating.query.order_by(Rating.created_at.desc()).all()
    result = []
    for r in ratings:
        rater = db.session.get(User, r.rater_id)
        result.append({
            'id': r.id,
            'raterName': rater.fullname if rater else 'Unknown',
            'rateeName': r.ratee_name,
            'stars': r.stars,
            'badgeText': r.badge_text,
            'comment': r.comment,
            'createdAt': r.created_at.isoformat(),
        })
    return jsonify(ratings=result)


@admin_bp.delete('/ratings/<int:rating_id>')
@jwt_required()
def delete_rating(rating_id):
    denied = _forbid_non_admin()
    if denied:
        return denied

    rating = db.session.get(Rating, rating_id)
    if not rating:
        return jsonify(error='Rating not found.'), 404

    # Deliberately does NOT touch coins/diamonds already awarded from this
    # rating - just removes the rating itself (see the plan this was built
    # from for why: simpler and avoids a user's balance going negative or
    # looking wrong after the fact).
    db.session.delete(rating)
    db.session.commit()
    return jsonify(status='ok')


@admin_bp.patch('/ratings/<int:rating_id>')
@jwt_required()
def edit_rating(rating_id):
    denied = _forbid_non_admin()
    if denied:
        return denied

    rating = db.session.get(Rating, rating_id)
    if not rating:
        return jsonify(error='Rating not found.'), 404

    data = request.get_json(silent=True) or {}
    if 'stars' in data:
        stars = int(data['stars'])
        if stars < 1 or stars > 5:
            return jsonify(error='Stars must be between 1 and 5.'), 400
        rating.stars = stars
    if 'comment' in data:
        rating.comment = (data['comment'] or '').strip() or None
    if 'badge_text' in data:
        # Badge text is free-typed by whoever left the rating (see
        # rate-partner.js's "Choose my own" option) - nothing stops someone
        # giving 5 stars while typing a mean badge as a joke/insult, so an
        # admin needs a real way to fix or blank it, not just rely on the
        # star count as a proxy for "is this actually mean". Rating.badge_text
        # is NOT NULL, so an empty edit is saved as '' (not None) - which
        # _badges_for_user() already treats as "no badge to show".
        rating.badge_text = (data['badge_text'] or '').strip()

    db.session.commit()
    return jsonify(status='ok')


@admin_bp.post('/messages/<int:message_id>/delete')
@jwt_required()
def admin_delete_message(message_id):
    # Same soft-delete Message.deleted flag the real sender-only delete
    # uses (see sockets.py's 'delete_message') - just reachable by an
    # admin for ANY message, not only your own, and over plain HTTP so it
    # works straight from the read-only admin chat viewer (which never
    # joins as a real participant able to fire socket events as itself).
    denied = _forbid_non_admin()
    if denied:
        return denied

    message = db.session.get(Message, message_id)
    if not message:
        return jsonify(error='Message not found.'), 404

    message.deleted = True
    db.session.commit()
    socketio.emit('message_deleted', {'messageId': message.id}, room=f'session-{message.session_id}')
    return jsonify(status='ok')


@admin_bp.post('/announce')
@jwt_required()
def send_announcement():
    denied = _forbid_non_admin()
    if denied:
        return denied

    data = request.get_json(silent=True) or {}
    message = (data.get('message') or '').strip()
    if not message:
        return jsonify(error='Please write a message to send.'), 400

    # Optional - targets exactly one real account instead of broadcasting
    # to everyone, for a message that only makes sense for that one person
    # (e.g. addressing something specific they reported or asked about).
    target_id = data.get('userId')
    if target_id:
        target = db.session.get(User, int(target_id))
        if not target:
            return jsonify(error='User not found.'), 404
        create_notification(target.id, 'announcement', message)
        return jsonify(status='ok', sentTo=1)

    users = User.query.all()
    for user in users:
        create_notification(user.id, 'announcement', message)

    return jsonify(status='ok', sentTo=len(users))


@admin_bp.post('/users/<int:user_id>/grant')
@jwt_required()
def grant_bonus(user_id):
    denied = _forbid_non_admin()
    if denied:
        return denied

    target = db.session.get(User, user_id)
    if not target:
        return jsonify(error='User not found.'), 404

    data = request.get_json(silent=True) or {}
    coins = int(data.get('coins') or 0)
    diamonds = int(data.get('diamonds') or 0)
    if coins <= 0 and diamonds <= 0:
        return jsonify(error='Enter a positive amount of coins or diamonds.'), 400

    target.points += coins
    target.diamonds += diamonds
    db.session.commit()

    parts = []
    if coins > 0:
        parts.append(f'+{coins} coins')
    if diamonds > 0:
        parts.append(f'+{diamonds} 💎')
    create_notification(user_id, 'bonus', f"Admin gave you a bonus: {' and '.join(parts)}!")

    return jsonify(status='ok', user={'id': target.id, 'points': target.points, 'diamonds': target.diamonds})
