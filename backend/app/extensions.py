# One shared instance of each extension, created here (not in __init__.py)
# so any file in the app can `from app.extensions import db` without
# risking a circular import with the app factory.
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_socketio import SocketIO

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
cors = CORS()
socketio = SocketIO()
