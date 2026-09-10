from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import Report, User

reports_bp = Blueprint('reports', __name__, url_prefix='/api/reports')


@reports_bp.post('')
@jwt_required()
def create_report():
    reporter_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    reported_id = data.get('reportedId')
    session_id = data.get('sessionId')

    if not reported_id or int(reported_id) == reporter_id:
        return jsonify(error='A real, different reportedId is required.'), 400
    if not db.session.get(User, reported_id):
        return jsonify(error='That user does not exist.'), 404

    report = Report(
        reporter_id=reporter_id,
        reported_id=reported_id,
        session_id=session_id,
        reason=data.get('reason'),
    )
    db.session.add(report)
    db.session.commit()

    return jsonify(status='ok'), 201
