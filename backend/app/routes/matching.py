import random
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func

from app.extensions import db, socketio
from app.models import User, HelpRequest, StudySession, Block, Favorite
from app.sockets import get_searching_user_ids, get_online_user_ids

matching_bp = Blueprint('matching', __name__, url_prefix='/api')

# A backup for the live 'matched_with_you' push below - sockets can drop
# a message, reconnect at a bad moment, or simply not have delivered yet
# by the time this runs. Without a backup, a missed push would strand
# someone forever: the requester already left searching_users the moment
# THEY found a match, so the candidate's own next poll could never
# rediscover the same match on its own. Recording it here means
# GET /api/matched-with-me (polled every cycle, same as the search
# itself) will self-heal within one poll interval even if the live push
# never arrives. Keyed by user_id, holding (candidate_data, expiry).
PENDING_MATCH_TTL = timedelta(seconds=30)
_pending_matches = {}


def _record_pending_match(user_id, payload):
    _pending_matches[user_id] = (payload, datetime.now(timezone.utc) + PENDING_MATCH_TTL)


def _pop_pending_match(user_id):
    entry = _pending_matches.pop(user_id, None)
    if not entry:
        return None
    payload, expires_at = entry
    if datetime.now(timezone.utc) > expires_at:
        return None
    return payload

# How much each signal is worth when scoring a candidate - a plain scoring
# function, not an AI call: matching is a structured ranking problem (real
# data we already have), not a fuzzy judgment call like "is this on topic"
# - so it's instant, free, and doesn't depend on an external API's uptime
# or quota.
OPEN_REQUEST_SCORE = 5
TOPIC_BONUS_SCORE = 2
EXPERIENCE_SCORE_PER_SESSION = 2
EXPERIENCE_SESSION_CAP = 3
SAME_GRADE_SCORE = 2
RATING_WEIGHT = 0.5
# A small nudge AWAY from whoever your last real 1-on-1 partner was, so two
# people who are both frequently online and well-matched don't just keep
# getting stuck with each other every single search - but small enough
# that they still win when they're genuinely the best (or only) real
# option, e.g. they also have a real open request for this exact subject.
RECENT_PARTNER_PENALTY = 3
# The opposite nudge, on purpose: someone you've explicitly favorited (see
# app/routes/favorites.py) should be MORE likely to come up, not less -
# this deliberately outweighs RECENT_PARTNER_PENALTY so favoriting someone
# you just studied with still brings them back to the top.
FAVORITE_BOOST = 4

# An "open" HelpRequest can sit around for hours (see requests.py's own
# 6-hour display window) - but matching someone to a request that old
# risks connecting them with a person who's long since closed their
# laptop, not someone actually looking right now. Even with real online
# tracking (below) this still matters as its OWN signal: a request from
# 3 hours ago means "asked once, then moved on," not "wants this today."
RECENT_REQUEST_WINDOW = timedelta(minutes=20)


def _score_candidate(candidate, me, subject, topic, opposite_mode, recent_partner_id, favorite_ids):
    # relevance = a real, currently-OPEN request for this exact subject -
    # the only thing that counts as "genuinely active right now." Past
    # experience, same grade, and rating are all tiebreak-only: useful for
    # RANKING among people who are already actively looking, but never
    # enough on their own to produce a match. Someone who taught this
    # subject once, months ago, but isn't looking for anything today isn't
    # a real match just because they happen to be logged in somewhere.
    # reason = a plain-English sentence explaining the STRONGEST signal
    # that made this a real match - shown on Match Found so the pick
    # feels like a real decision, not an arbitrary name.
    relevance = 0
    tiebreak = 0
    reason = None
    verb = 'teach' if opposite_mode == 'teach' else 'learn'

    # Actively looking for the same thing right now, in the role that
    # complements ours - the strongest possible signal (e.g. I want to
    # learn Calculus, they have an open request to TEACH Calculus).
    recent_cutoff = datetime.now(timezone.utc) - RECENT_REQUEST_WINDOW
    open_request = (
        HelpRequest.query
        .filter(HelpRequest.user_id == candidate.id)
        .filter(HelpRequest.status == 'open')
        .filter(HelpRequest.mode == opposite_mode)
        .filter(func.lower(HelpRequest.subject) == subject.lower())
        .filter(HelpRequest.created_at >= recent_cutoff)
        .first()
    )
    if open_request:
        relevance += OPEN_REQUEST_SCORE
        reason = f"{candidate.fullname} is looking to {verb} {open_request.topic or subject} right now"
        if topic and open_request.topic and open_request.topic.lower() == topic.lower():
            relevance += TOPIC_BONUS_SCORE

    # Real experience with this subject, on the complementary side -
    # someone who's TAUGHT it before is a better match for a learner;
    # someone who's LEARNED it before shows genuine interest for a teacher.
    experience = (
        StudySession.query
        .filter(StudySession.learner_id == candidate.id)
        .filter(StudySession.mode == opposite_mode)
        .filter(StudySession.ended_at.isnot(None))
        .filter(func.lower(StudySession.subject) == subject.lower())
        .count()
    )
    tiebreak += min(experience, EXPERIENCE_SESSION_CAP) * EXPERIENCE_SCORE_PER_SESSION
    if experience and not reason:
        times = 'once' if experience == 1 else f'{experience} times'
        verbed = 'taught' if opposite_mode == 'teach' else 'learned'
        reason = f"{candidate.fullname} has {verbed} {subject} {times} before"

    # Similar grade - a rough proxy for "won't feel too basic or too
    # advanced" for either side of the conversation.
    if me.grade and candidate.grade and me.grade.strip().lower() == candidate.grade.strip().lower():
        tiebreak += SAME_GRADE_SCORE

    # Overall rating as a light tie-breaker, not a dominant factor.
    rating = candidate.average_rating()
    if rating:
        tiebreak += rating * RATING_WEIGHT

    # Nudge away from a rematch with whoever you just studied with - see
    # RECENT_PARTNER_PENALTY above for why this is small, not exclusion.
    if recent_partner_id and candidate.id == recent_partner_id:
        tiebreak -= RECENT_PARTNER_PENALTY

    # ...but a real, explicit favorite overrides that nudge - see
    # FAVORITE_BOOST above.
    if candidate.id in favorite_ids:
        tiebreak += FAVORITE_BOOST

    return relevance, tiebreak, reason


def _get_favorite_ids(my_id):
    return {f.favorite_id for f in Favorite.query.filter_by(user_id=my_id).all()}


def _is_blocked_pair(user_a_id, user_b_id):
    # A block only makes sense as a two-way exclusion (see match_candidate()
    # above) - checked here too since matched_with_me()'s DB fallback and
    # announce_match() both hand back a real match WITHOUT ever going
    # through match_candidate()'s own exclusion list.
    return (
        Block.query.filter_by(blocker_id=user_a_id, blocked_id=user_b_id).first() is not None
        or Block.query.filter_by(blocker_id=user_b_id, blocked_id=user_a_id).first() is not None
    )


def _get_recent_partner_id(my_id):
    last_session = (
        StudySession.query
        .filter(StudySession.mode != 'group')
        .filter(StudySession.ended_at.isnot(None))
        .filter(db.or_(StudySession.learner_id == my_id, StudySession.partner_id == my_id))
        .order_by(StudySession.ended_at.desc())
        .first()
    )
    if not last_session:
        return None
    return last_session.partner_id if last_session.learner_id == my_id else last_session.learner_id


@matching_bp.get('/match-candidate')
@jwt_required()
def match_candidate():
    my_id = int(get_jwt_identity())
    # Optional: a user id to also skip - used right after a partner
    # disconnects, so "finding you another match" can't immediately
    # re-match you with the exact same person who just left.
    exclude_id = request.args.get('exclude', type=int)
    subject = (request.args.get('subject') or '').strip()
    topic = (request.args.get('topic') or '').strip()
    mode = request.args.get('mode') or 'learn'  # what the REQUESTER wants to do

    excluded_ids = {my_id}
    if exclude_id:
        excluded_ids.add(exclude_id)

    # If EITHER side has ever blocked the other, neither should ever be
    # matched with or shown the other again - a block only makes sense as
    # a two-way exclusion (you shouldn't keep getting matched with someone
    # who blocked YOU either, even though you never blocked them).
    blocked_by_me = {b.blocked_id for b in Block.query.filter_by(blocker_id=my_id).all()}
    blocked_me = {b.blocker_id for b in Block.query.filter_by(blocked_id=my_id).all()}
    excluded_ids |= blocked_by_me | blocked_me

    # A real match requires the OTHER person to be on this exact same
    # matching screen right now too, not just logged in somewhere else in
    # the app (Home, Profile...) - see app/sockets.py's searching_users,
    # set only while connecting.js is actively polling. Both sides have
    # to genuinely be looking at the same moment, same as a real
    # simultaneous match.
    searching_ids = get_searching_user_ids()
    candidates = User.query.filter(User.id.notin_(excluded_ids)).filter(User.id.in_(searching_ids)).all()
    if not candidates:
        return jsonify(candidate=None)

    me = db.session.get(User, my_id)

    if not subject or not me:
        # No subject to score against, so there's no honest way to say
        # anyone is a real match - tell the frontend to show "no match"
        # (which points the user to post a community request) instead of
        # handing them a random unrelated person.
        return jsonify(candidate=None)

    opposite_mode = 'teach' if mode == 'learn' else 'learn'
    recent_partner_id = _get_recent_partner_id(my_id)
    favorite_ids = _get_favorite_ids(my_id)
    scored = [
        (_score_candidate(c, me, subject, topic, opposite_mode, recent_partner_id, favorite_ids), c)
        for c in candidates
    ]
    # Only candidates with actual relevance (an open request or real past
    # experience for THIS subject) are eligible at all - grade/rating are
    # tie-breakers for ranking among relevant people, not a way to
    # manufacture a match out of two people who share a grade but have
    # never touched this subject.
    relevant = [(rel, tie, reason, c) for (rel, tie, reason), c in scored if rel > 0]

    if not relevant:
        # Nobody has a real, currently-open request for this subject -
        # matching against past experience alone (someone who taught it
        # once, ages ago) or a random unrelated online person would just
        # recreate the "clicks and finds nothing" problem with a real
        # name instead of a fake one. Be honest instead: no match, go
        # post a request.
        return jsonify(candidate=None)

    top_total = max(rel + tie for rel, tie, _, _ in relevant)
    # Pick randomly among the top-scoring group (not always the single
    # highest) so the same "best" person isn't matched every single time.
    best = [(reason, c) for rel, tie, reason, c in relevant if rel + tie == top_total]
    reason, candidate = random.choice(best)

    # Tell the CANDIDATE too, right now - both live (for an instant
    # redirect) AND recorded as a pending match (as a backup in case the
    # live push is ever missed - see _pending_matches above). Without
    # this, they'd have to independently rediscover the exact same match
    # on their own next poll, which can never happen once the requester
    # leaves searching_users the moment THEY reach Match Found.
    match_payload = {
        'partnerId': my_id,
        'partnerName': me.fullname,
        'partnerCountry': me.country,
        'subject': subject,
        'topic': topic,
        'mode': opposite_mode,  # the CANDIDATE's role, opposite of the requester's
    }
    socketio.emit('matched_with_you', match_payload, room=f'user-{candidate.id}')
    _record_pending_match(candidate.id, match_payload)

    return jsonify(candidate=candidate.to_public_dict(), reason=reason)


@matching_bp.get('/matched-with-me')
@jwt_required()
def matched_with_me():
    # The polling backup for 'matched_with_you' - connecting.js checks
    # this on every regular poll cycle, so even if the live socket push
    # was somehow missed, this self-heals within one poll interval
    # instead of leaving someone stuck "Finding your match" forever.
    my_id = int(get_jwt_identity())
    payload = _pop_pending_match(my_id)
    if payload:
        return jsonify(match=payload)

    # The pending-match cache above only lives for PENDING_MATCH_TTL (30s)
    # - a real gap if the live push AND every poll during that window all
    # missed (e.g. a dropped connection right as the match happened).
    # Past that window there was nothing left to self-heal from, so
    # someone could be stuck on "Finding your match" forever even though
    # a real session already exists for them. This checks the actual
    # database as a second, durable fallback: is there a real, still-open
    # 1-on-1 session where someone ELSE already made THIS person the
    # partner? If so, it's a real match no matter how long ago it happened.
    # Only a RECENT session counts - hundreds of old sessions were never
    # formally ended (people just closed the tab), and without a cutoff
    # one of those weeks-old rows kept resurfacing as a brand-new
    # "Match found" with someone who was never actually searching.
    fresh_cutoff = datetime.utcnow() - timedelta(minutes=10)
    existing = (
        StudySession.query
        .filter(StudySession.mode != 'group')
        .filter(StudySession.partner_id == my_id)
        .filter(StudySession.ended_at.is_(None))
        .filter(StudySession.started_at >= fresh_cutoff)
        .order_by(StudySession.id.desc())
        .first()
    )
    if not existing:
        return jsonify(match=None)

    learner = db.session.get(User, existing.learner_id)
    if not learner:
        return jsonify(match=None)

    # A block made AFTER this session was created (but never properly
    # closed - see session.js's Block button) must still win here - this
    # fallback existing at all is exactly what let a blocked person
    # resurface as a "real" match, bypassing the block entirely.
    if _is_blocked_pair(my_id, existing.learner_id):
        return jsonify(match=None)

    return jsonify(match={
        'partnerId': existing.learner_id,
        'partnerName': learner.fullname,
        'partnerCountry': learner.country,
        'subject': existing.subject or '',
        'topic': existing.topic or '',
        'mode': 'learn' if existing.mode == 'teach' else 'teach',
    })


@matching_bp.post('/announce-match')
@jwt_required()
def announce_match():
    # match_candidate() above is only reached by the GENERIC subject-search
    # flow (choose-subject.html). Clicking a real community request
    # directly (Home's "Help her"/"Join" buttons) already knows exactly
    # who the partner is, so connecting.js skips match_candidate() entirely
    # and goes straight to Match Found - which used to mean the OTHER
    # person (still on their own connecting.html, actively searching)
    # never heard about it at all: no live push, no pending-match record,
    # nothing. Same live push + pending-match backup as match_candidate(),
    # just triggered from this second, different "we already know who"
    # path instead of a scored match.
    my_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    partner_id = data.get('partnerId')
    mode = data.get('mode') or 'learn'  # OUR OWN role, same convention as connecting.js's `mode`

    if not partner_id or int(partner_id) == my_id:
        return jsonify(error='A real, different partnerId is required.'), 400

    me = db.session.get(User, my_id)
    if not me:
        return jsonify(error='Not found.'), 404

    # This path skips match_candidate() entirely (see above), which is
    # the ONLY place a block was actually being checked - clicking a
    # community request from someone you'd blocked (or who'd blocked you)
    # went through with zero enforcement until this check existed.
    if _is_blocked_pair(my_id, int(partner_id)):
        return jsonify(error='blocked'), 403

    # A community request stays postable/clickable whether or not its
    # poster is around right now, but "Match Found" itself shouldn't lie -
    # if they're not actually online at this exact moment, say so instead
    # of showing a match that isn't really ready to start a live chat yet.
    if int(partner_id) not in get_online_user_ids():
        return jsonify(error='not_online', offline=True), 409

    match_payload = {
        'partnerId': my_id,
        'partnerName': me.fullname,
        'partnerCountry': me.country,
        'subject': data.get('subject') or '',
        'topic': data.get('topic') or '',
        'mode': 'teach' if mode == 'learn' else 'learn',  # the PARTNER's role, opposite of ours
    }
    socketio.emit('matched_with_you', match_payload, room=f'user-{int(partner_id)}')
    _record_pending_match(int(partner_id), match_payload)

    return jsonify(status='ok')
