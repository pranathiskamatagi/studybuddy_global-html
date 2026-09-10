from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db, socketio
from app.models import HelpRequest

requests_bp = Blueprint('requests', __name__, url_prefix='/api/help-requests')

VALID_MODES = {'learn', 'teach'}
# Requests older than this stop showing up - keeps the community list from
# filling with stale asks nobody ever answered.
REQUEST_LIFETIME = timedelta(hours=6)


@requests_bp.post('')
@jwt_required()
def create_request():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    mode = data.get('mode')
    if mode not in VALID_MODES:
        return jsonify(error="mode must be 'learn' or 'teach'"), 400

    help_request = HelpRequest(
        user_id=user_id,
        mode=mode,
        subject=data.get('subject'),
        topic=data.get('topic'),
        level=data.get('level'),
    )
    db.session.add(help_request)
    db.session.commit()
    return jsonify(request=help_request.to_public_dict()), 201


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
    cutoff = datetime.now(timezone.utc) - REQUEST_LIFETIME

    requests_query = (
        HelpRequest.query
        .filter(HelpRequest.status == 'open')
        .filter(HelpRequest.user_id != user_id)  # never show your own request back to you
        .filter(HelpRequest.created_at >= cutoff)
        .order_by(HelpRequest.created_at.desc())
        .limit(20)
        .all()
    )
    return jsonify(requests=[r.to_public_dict() for r in requests_query])


@requests_bp.post('/<int:request_id>/fulfill')
@jwt_required()
def fulfill_request(request_id):
    help_request = db.session.get(HelpRequest, request_id)
    if not help_request:
        return jsonify(error='Request not found.'), 404

    help_request.status = 'fulfilled'
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
