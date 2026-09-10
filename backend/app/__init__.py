from flask import Flask, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity

from app.config import Config
from app.extensions import db, migrate, jwt, cors, socketio


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    # CORS_ORIGIN is a comma-separated list (e.g. Live Server AND the
    # local test preview both need access) - split it into the list
    # flask-cors expects. supports_credentials isn't needed since we use
    # a JWT in the Authorization header, not cookies.
    allowed_origins = [origin.strip() for origin in app.config['CORS_ORIGIN'].split(',')]
    cors.init_app(app, origins=allowed_origins)
    # cors=allowed_origins here too - Socket.IO's handshake is a separate
    # thing from regular HTTP requests, so flask-cors above doesn't cover it.
    socketio.init_app(app, cors_allowed_origins=allowed_origins)

    # Importing models here (not at the top of the file) so they're
    # registered with SQLAlchemy before Flask-Migrate looks for them,
    # without creating a circular import with app/extensions.py.
    from app import models  # noqa: F401

    from app.routes.auth import auth_bp
    from app.routes.profile import profile_bp
    from app.routes.sessions import sessions_bp
    from app.routes.ratings import ratings_bp
    from app.routes.leaderboard import leaderboard_bp
    from app.routes.matching import matching_bp
    from app.routes.requests import requests_bp
    from app.routes.notifications import notifications_bp
    from app.routes.achievements import achievements_bp
    from app.routes.quiz import quiz_bp
    from app.routes.blocks import blocks_bp
    from app.routes.support import support_bp
    from app.routes.admin import admin_bp
    from app.routes.users import users_bp
    from app.routes.reports import reports_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(profile_bp)
    app.register_blueprint(sessions_bp)
    app.register_blueprint(ratings_bp)
    app.register_blueprint(leaderboard_bp)
    app.register_blueprint(matching_bp)
    app.register_blueprint(requests_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(achievements_bp)
    app.register_blueprint(quiz_bp)
    app.register_blueprint(blocks_bp)
    app.register_blueprint(support_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(reports_bp)

    # A ban needs to end an already-open session too, not just block the
    # NEXT login - this runs before every /api/* request and 403s
    # immediately if the token belongs to a now-banned account. optional=True
    # so routes with no JWT at all (signup, login) pass through untouched.
    @app.before_request
    def _reject_banned_users():
        from flask import request
        if not request.path.startswith('/api/') or request.method == 'OPTIONS':
            return None
        verify_jwt_in_request(optional=True)
        user_id = get_jwt_identity()
        if user_id is None:
            return None
        from app.models import User
        user = db.session.get(User, int(user_id))
        if user and user.is_banned:
            return jsonify(error='This account has been suspended.'), 403
        return None

    # Registers the @socketio.on(...) handlers in sockets.py - importing
    # the module is what makes those decorators actually run.
    from app import sockets  # noqa: F401

    @app.get('/api/health')
    def health():
        return {'status': 'ok'}

    return app
