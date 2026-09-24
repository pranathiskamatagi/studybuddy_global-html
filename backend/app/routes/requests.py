from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db, socketio
from app.models import HelpRequest, Block, ScheduledSession, User, StudySession, GroupMembership
from app.notification_helpers import create_notification

from app.scheduled_reminders import find_duplicate_scheduled

requests_bp = Blueprint('requests', __name__, url_prefix='/api/help-requests')

VALID_MODES = {'learn', 'teach'}
# 'group' only ever makes sense for a SCHEDULED-for-later request (an
# instant group ask already has its own real flow - group-subject.js
# calls /sessions/join-or-create-group directly, no HelpRequest
# involved) - see create_request()'s own check for why.
VALID_MODES_WITH_GROUP = VALID_MODES | {'group'}
# Requests older than this stop showing up - keeps the community list from
# filling with stale asks nobody ever answered. Only applies to INSTANT
# ("right now") requests - see list_requests()'s own cutoff logic for a
# scheduled-for-later one, which needs to stay visible on its own timeline.
REQUEST_LIFETIME = timedelta(hours=6)
# How long a scheduled-for-later request stays visible/fulfillable AFTER
# its own target time has passed, before it's treated the same as any
# other stale, never-answered ask.
SCHEDULED_REQUEST_GRACE = timedelta(hours=6)


@requests_bp.post('')
@jwt_required()
def create_request():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    mode = data.get('mode')
    if mode not in VALID_MODES_WITH_GROUP:
        return jsonify(error="mode must be 'learn', 'teach', or 'group'"), 400

    # Optional: "Schedule for later" (choose-subject.html/teach-subject.html/
    # group-subject.html) instead of searching right now - a real future
    # time, not just a request posted now. A bad/unparseable value is
    # treated the same as not sending one at all, rather than failing the
    # whole post.
    scheduled_for = None
    raw_scheduled_for = data.get('scheduledFor')
    if raw_scheduled_for:
        try:
            parsed = datetime.fromisoformat(raw_scheduled_for.replace('Z', '+00:00'))
            # Naive-UTC for storage - see ScheduledSession.scheduled_for's
            # own comment for why (SQLite drops tzinfo either way).
            scheduled_for = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        except (ValueError, AttributeError):
            pass

    if mode == 'group' and not scheduled_for:
        return jsonify(error='A group request only makes sense with a real scheduled time.'), 400

    help_request = HelpRequest(
        user_id=user_id,
        mode=mode,
        subject=data.get('subject'),
        topic=data.get('topic'),
        level=data.get('level'),
        scheduled_for=scheduled_for,
    )
    db.session.add(help_request)
    db.session.commit()
    return jsonify(request=help_request.to_public_dict()), 201


@requests_bp.get('/mine')
@jwt_required()
def my_requests():
    # Everything you've personally posted and is still genuinely pending -
    # a "Schedule for later" post used to just show a one-time alert()
    # confirming it went out, with nowhere in the app to actually SEE it
    # again afterward (list_requests() above deliberately excludes your
    # own posts, since that list is "things to help with," not "things
    # you asked for"). This is what fills that gap on Home.
    user_id = int(get_jwt_identity())
    now = datetime.utcnow()
    mine = (
        HelpRequest.query
        .filter(HelpRequest.user_id == user_id)
        .filter(HelpRequest.status == 'open')
        .filter(HelpRequest.scheduled_for.isnot(None))
        # A group request moves to GET /group-ready (a real "Join now") once
        # its time actually arrives - a 1-on-1 one has no self-join concept
        # (someone else has to fulfill it), so it just keeps showing here
        # regardless of time until that happens.
        .filter(db.or_(HelpRequest.mode != 'group', HelpRequest.scheduled_for > now))
        .order_by(HelpRequest.scheduled_for.asc())
        .all()
    )
    return jsonify(requests=[r.to_public_dict() for r in mine])


# Same early-join window as scheduled.py's 1-on-1 JOIN_EARLY_WINDOW - real
# people take a few minutes to actually get to their screen.
GROUP_JOIN_EARLY_WINDOW = timedelta(minutes=10)


@requests_bp.get('/group-ready')
@jwt_required()
def group_ready_requests():
    # A group "Schedule for later" request used to have NO real "it's time,
    # join now" moment at all - the poster and anyone who clicked "I'm
    # interested" were just expected to remember to come back and manually
    # re-enter the same subject/topic once the time arrived. This is the
    # real equivalent of the 1-on-1 "ready to join" card on Home: anyone
    # with a real stake in this group (posted it, or said they're
    # interested) sees it here the moment it's actually time.
    user_id = int(get_jwt_identity())
    now = datetime.utcnow()
    candidates = (
        HelpRequest.query
        .filter(HelpRequest.mode == 'group')
        .filter(HelpRequest.status == 'open')
        .filter(HelpRequest.scheduled_for.isnot(None))
        .filter(HelpRequest.scheduled_for <= now + GROUP_JOIN_EARLY_WINDOW)
        .all()
    )
    # Even for the ORIGINAL POSTER, a join button is pointless if nobody's
    # actually shown real interest yet - clicking it just lands them alone
    # in "Finding members..." with nothing behind it. Only surface this
    # once there's a REAL person to actually meet.
    mine = [
        r for r in candidates
        if r.interested_count > 0 and (r.user_id == user_id or user_id in (r.interested_user_ids or []))
    ]

    # A group request never formally closes (see interested_in_group_request
    # - a real group can keep welcoming people), so without this, "Join now"
    # kept showing here even after you'd already gone and actually created/
    # joined the real group chat for it - a confusing second, redundant way
    # to do something you'd already done, sitting right next to the real
    # "Active study sessions" card for that same group.
    my_groups = (
        StudySession.query
        .join(GroupMembership, GroupMembership.session_id == StudySession.id)
        .filter(GroupMembership.user_id == user_id)
        .filter(StudySession.mode == 'group')
        .filter(StudySession.ended_at.is_(None))
        .all()
    )
    already_joined_keys = {
        ((gs.subject or '').strip().lower(), (gs.topic or '').strip().lower())
        for gs in my_groups
    }
    mine = [
        r for r in mine
        if ((r.subject or '').strip().lower(), (r.topic or '').strip().lower()) not in already_joined_keys
    ]

    return jsonify(requests=[r.to_public_dict() for r in mine])


@requests_bp.get('/recent')
@jwt_required()
def recent_requests():
    # The real chips for "Recent searches" on choose-subject.html/
    # teach-subject.html - what THIS user has actually searched before,
    # not a hardcoded guess. Every status counts (even a cancelled or
    # fulfilled request still means they really searched for it once) -
    # only 'open' vs not matters for community visibility, not history.
    user_id = int(get_jwt_identity())
    mode = request.args.get('mode')
    if mode not in VALID_MODES:
        return jsonify(error="mode must be 'learn' or 'teach'"), 400

    rows = (
        HelpRequest.query
        .filter(HelpRequest.user_id == user_id)
        .filter(HelpRequest.mode == mode)
        .filter(HelpRequest.topic.isnot(None))
        .order_by(HelpRequest.created_at.desc())
        .limit(30)
        .all()
    )

    # Keep only the most recent occurrence of each distinct topic, in
    # recency order - searching "Calculus" three times shouldn't produce
    # three identical chips.
    seen = set()
    recent = []
    for r in rows:
        key = r.topic.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        recent.append({'subject': r.subject, 'topic': r.topic})
        if len(recent) == 5:
            break

    return jsonify(recent=recent)


@requests_bp.get('')
@jwt_required()
def list_requests():
    user_id = int(get_jwt_identity())
    # datetime.utcnow() (naive), not an aware datetime.now(timezone.utc) -
    # SQLite silently drops the timezone marker on storage, so
    # created_at/scheduled_for come back NAIVE even though they were saved
    # as real UTC. Comparing them against an AWARE cutoff in a query
    # filter doesn't raise (it's a SQL WHERE clause, not a Python-level
    # comparison) - it just silently produces the wrong SQL and quietly
    # excludes rows that should have matched, which is exactly why every
    # scheduled-for-later request was invisible on Home/Connect. Same
    # gotcha, same fix, as routes/scheduled.py and weekly_recap.py.
    cutoff = datetime.utcnow() - REQUEST_LIFETIME

    # A block is a two-way "never see each other again" - same rule
    # matching.py already enforces for actual matches. Without this, a
    # blocked person's community request still showed up and was
    # clickable, defeating the point of blocking them at all.
    blocked_by_me = {b.blocked_id for b in Block.query.filter_by(blocker_id=user_id).all()}
    blocked_me = {b.blocker_id for b in Block.query.filter_by(blocked_id=user_id).all()}
    hidden_user_ids = blocked_by_me | blocked_me

    scheduled_cutoff = datetime.utcnow() - SCHEDULED_REQUEST_GRACE

    requests_query = (
        HelpRequest.query
        .filter(HelpRequest.status == 'open')
        .filter(HelpRequest.user_id != user_id)  # never show your own request back to you
        .filter(HelpRequest.user_id.notin_(hidden_user_ids))
        .filter(
            # An instant request goes stale 6 hours after being POSTED
            # (the original rule) - a scheduled-for-later one instead
            # goes stale relative to its own TARGET time, since it can
            # legitimately sit there for days before that time arrives.
            db.or_(
                db.and_(HelpRequest.scheduled_for.is_(None), HelpRequest.created_at >= cutoff),
                HelpRequest.scheduled_for >= scheduled_cutoff,
            )
        )
        .order_by(
            # "Right now" requests first (the main reason someone's
            # browsing this list at all), THEN scheduled-for-later ones,
            # soonest first among themselves.
            db.case((HelpRequest.scheduled_for.is_(None), 0), else_=1).asc(),
            HelpRequest.scheduled_for.asc(),
            HelpRequest.created_at.desc(),
        )
        .limit(20)
        .all()
    )
    return jsonify(requests=[r.to_public_dict(viewer_id=user_id) for r in requests_query])


@requests_bp.post('/<int:request_id>/interested')
@jwt_required()
def interested_in_group_request(request_id):
    # The group version of "fulfill" - deliberately does NOT close the
    # request, since a real group can (and should) welcome more than one
    # person, unlike a 1-on-1 request which only ever needs exactly one
    # answer. Just tells the original poster a real person wants in;
    # actually joining the group happens the normal way (group-subject.html,
    # same subject+topic, at the scheduled time - see
    # sessions.py's join_or_create_group, which already merges anyone
    # onto the same real group rather than creating a duplicate).
    my_id = int(get_jwt_identity())
    help_request = db.session.get(HelpRequest, request_id)
    if not help_request or help_request.mode != 'group':
        return jsonify(error='Not found.'), 404
    if help_request.user_id == my_id:
        return jsonify(error="It's your own group request."), 400

    interested_user = db.session.get(User, my_id)
    already_counted = my_id in (help_request.interested_user_ids or [])
    if not already_counted:
        help_request.interested_user_ids = [*(help_request.interested_user_ids or []), my_id]
        help_request.interested_count += 1
        db.session.commit()
        create_notification(
            help_request.user_id, 'group_request_interested',
            f"{interested_user.fullname} wants to join your {help_request.topic or help_request.subject} group session!",
        )
    return jsonify(status='ok')


@requests_bp.post('/<int:request_id>/fulfill')
@jwt_required()
def fulfill_request(request_id):
    fulfiller_id = int(get_jwt_identity())
    help_request = db.session.get(HelpRequest, request_id)
    if not help_request:
        return jsonify(error='Request not found.'), 404
    if help_request.mode == 'group':
        return jsonify(error="Use /interested for a group request."), 400
    if help_request.user_id == fulfiller_id:
        return jsonify(error="You can't fulfill your own request."), 400
    # Without this, calling this twice for the same request (a double
    # click, the quiz flow's fulfillRequestId page being reached again via
    # the browser back button, a retried request) silently created a
    # SECOND real ScheduledSession every time - same request, same two
    # people, same time, just duplicated - instead of the second call
    # failing cleanly.
    if help_request.status != 'open':
        return jsonify(error='This request has already been taken.'), 409

    help_request.status = 'fulfilled'

    # A scheduled-for-later request has nobody online to drop straight
    # into a live chat with (the whole point was asking for a FUTURE
    # time) - instead this becomes a real, already-accepted scheduled
    # session between the two of them, so it shows up in both people's
    # Scheduled Sessions ready to join once that time arrives, and the
    # original poster gets told a real person is now coming.
    if help_request.scheduled_for and find_duplicate_scheduled(
        fulfiller_id, help_request.user_id, help_request.scheduled_for,
    ):
        # Same two people, same time - already scheduled, so don't make a
        # second identical appointment (see find_duplicate_scheduled).
        db.session.commit()
    elif help_request.scheduled_for:
        fulfiller = db.session.get(User, fulfiller_id)
        scheduled = ScheduledSession(
            proposer_id=fulfiller_id,
            invitee_id=help_request.user_id,
            subject=help_request.subject,
            topic=help_request.topic,
            # The FULFILLER's own role - the opposite of what the poster
            # asked for (they wanted to learn, so the fulfiller teaches,
            # and vice versa) - same convention as ScheduledSession.mode.
            mode='teach' if help_request.mode == 'learn' else 'learn',
            scheduled_for=help_request.scheduled_for,
            status='accepted',  # no separate accept step - the poster already asked for exactly this
        )
        db.session.add(scheduled)
        db.session.commit()
        create_notification(
            help_request.user_id,
            'session_scheduled_matched',
            f"{fulfiller.fullname if fulfiller else 'Someone'} found you a partner for your scheduled "
            f"{help_request.subject or help_request.topic or 'study'} session!",
        )
    else:
        db.session.commit()

    # Live push so this card disappears from anyone's ALREADY-OPEN Home/
    # Connect page immediately, not just on their next reload - no room
    # specified means every currently-connected socket gets it, since we
    # don't track who's currently looking at which request card.
    socketio.emit('request_removed', {'requestId': help_request.id})
    return jsonify(request=help_request.to_public_dict())


@requests_bp.post('/<int:request_id>/cancel')
@jwt_required()
def cancel_request(request_id):
    # For withdrawing your OWN request - e.g. clicking Cancel on the
    # matching screen - so it stops showing on everyone else's Home/
    # Connect the moment you give up on it, instead of sitting there
    # looking active until it ages out hours later.
    user_id = int(get_jwt_identity())
    help_request = db.session.get(HelpRequest, request_id)
    if not help_request:
        return jsonify(error='Request not found.'), 404
    if help_request.user_id != user_id:
        return jsonify(error='Not your request.'), 403

    help_request.status = 'cancelled'
    db.session.commit()
    socketio.emit('request_removed', {'requestId': help_request.id})
    return jsonify(request=help_request.to_public_dict())


@requests_bp.post('/cancel-all')
@jwt_required()
def cancel_all_requests():
    # Clicking Cancel on the matching screen only ever withdrew the ONE
    # request tied to THAT specific search - but someone who's tried
    # searching a few times (each one posts its own real request) ends up
    # with several open at once, and giving up on the search should
    # reasonably mean giving up on ALL of them, not just the latest.
    user_id = int(get_jwt_identity())
    open_requests = HelpRequest.query.filter_by(user_id=user_id, status='open').all()
    ids = [r.id for r in open_requests]
    for r in open_requests:
        r.status = 'cancelled'
    db.session.commit()
    for request_id in ids:
        socketio.emit('request_removed', {'requestId': request_id})
    return jsonify(cancelled=ids)
