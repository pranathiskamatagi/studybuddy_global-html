from flask import Flask
from config import Config
from extensions import db, bcrypt, jwt, migrate, cors
from routes.auth_routes import auth_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Attach extensions to this app instance
    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app)  # allows your frontend (different origin) to call this API

    # Register blueprints
    app.register_blueprint(auth_bp)

    @app.route('/api/health', methods=['GET'])
    def health_check():
        return {'status': 'StudyBuddy Global API is running'}, 200

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5000)