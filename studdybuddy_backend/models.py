from datetime import datetime
from extensions import db


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)

    # Profile fields
    bio = db.Column(db.Text, default='')
    country = db.Column(db.String(80), default='')
    grade = db.Column(db.String(40), default='')
    avatar_url = db.Column(db.String(255), default='')
    interests = db.Column(db.ARRAY(db.String), default=[])   # PostgreSQL array type
    subjects = db.Column(db.ARRAY(db.String), default=[])

    # Gamification (feeds the XP widget on Home)
    xp = db.Column(db.Integer, default=0)
    level = db.Column(db.Integer, default=1)
    streak = db.Column(db.Integer, default=0)
    rating = db.Column(db.Float, default=0.0)
    rating_count = db.Column(db.Integer, default=0)

    # Status
    is_verified = db.Column(db.Boolean, default=False)
    is_blocked_platform = db.Column(db.Boolean, default=False)  # banned by moderation, not user-to-user block

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_active = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        """Safe representation for API responses — never includes password_hash."""
        return {
            'id': self.id,
            'full_name': self.full_name,
            'email': self.email,
            'bio': self.bio,
            'country': self.country,
            'grade': self.grade,
            'avatar_url': self.avatar_url,
            'interests': self.interests,
            'subjects': self.subjects,
            'xp': self.xp,
            'level': self.level,
            'streak': self.streak,
            'rating': self.rating,
            'rating_count': self.rating_count,
            'created_at': self.created_at.isoformat()
        }


class Badge(db.Model):
    __tablename__ = 'badges'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    description = db.Column(db.String(255))
    icon = db.Column(db.String(80))       # Font Awesome class, e.g. "fa-medal"
    color_theme = db.Column(db.String(20))  # 'gold' | 'green' | 'blue' — matches your CSS badge classes


class UserBadge(db.Model):
    __tablename__ = 'user_badges'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    badge_id = db.Column(db.Integer, db.ForeignKey('badges.id'), nullable=False)
    earned_at = db.Column(db.DateTime, default=datetime.utcnow)


class Block(db.Model):
    __tablename__ = 'blocks'

    id = db.Column(db.Integer, primary_key=True)
    blocker_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    blocked_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Report(db.Model):
    __tablename__ = 'reports'

    id = db.Column(db.Integer, primary_key=True)
    reporter_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    reported_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    reason = db.Column(db.String(50), nullable=False)   # matches your modal's radio values
    notes = db.Column(db.Text, default='')
    status = db.Column(db.String(20), default='pending')  # pending | reviewed | dismissed
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class ChatSession(db.Model):
    __tablename__ = 'chat_sessions'

    id = db.Column(db.Integer, primary_key=True)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    learner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    subject = db.Column(db.String(80))
    topic = db.Column(db.String(80))
    level = db.Column(db.String(20))          # basic | intermediate | advanced
    status = db.Column(db.String(20), default='active')  # active | ended | abandoned
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    ended_at = db.Column(db.DateTime, nullable=True)


class Message(db.Model):
    __tablename__ = 'messages'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('chat_sessions.id'), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    message_type = db.Column(db.String(20), default='text')  # text | image | voice
    sent_at = db.Column(db.DateTime, default=datetime.utcnow)