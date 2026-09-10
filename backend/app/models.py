from datetime import datetime, timezone
from sqlalchemy import func
from app.extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    fullname = db.Column(db.String(120), nullable=False)
    # unique=True stops two accounts from ever sharing an email at the
    # database level - a second safety net even if the API forgets to check.
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    country = db.Column(db.String(100))
    grade = db.Column(db.String(100))
    language = db.Column(db.String(100))
    bio = db.Column(db.Text)
    # A data: URI (e.g. "data:image/jpeg;base64,...") - resized/compressed
    # client-side before upload, so this stays small. No file storage
    # needed for a project this size; nullable, falls back to a letter
    # avatar on the frontend when not set.
    photo_data = db.Column(db.Text)

    points = db.Column(db.Integer, nullable=False, default=0)
    diamonds = db.Column(db.Integer, nullable=False, default=0)

    # Running counts used to work out the "every 2nd" gamification rules
    # without having to re-scan every past session/rating each time.
    completed_session_count = db.Column(db.Integer, nullable=False, default=0)
    five_star_session_count = db.Column(db.Integer, nullable=False, default=0)

    # Day streak - consecutive CALENDAR DAYS (UTC) with at least one real,
    # completed session (same "longer than 10 minutes" rule as points -
    # see gamification.py's update_streak()). last_streak_date is what
    # actually drives the day-to-day math; current/longest are just
    # cached results kept in sync alongside it so a page load never has
    # to re-derive them from session history.
    current_streak_days = db.Column(db.Integer, nullable=False, default=0)
    longest_streak_days = db.Column(db.Integer, nullable=False, default=0)
    last_streak_date = db.Column(db.Date, nullable=True)

    # Never set through signup or any editable UI - only ever flipped
    # directly in the database, for exactly one real account. See
    # app/admin_helpers.py for how routes check this.
    is_admin = db.Column(db.Boolean, nullable=False, default=False)
    # Checked both at login (auth.py) and on every request (see the
    # before_request hook in app/__init__.py) - a ban needs to end an
    # already-open session too, not just block the next login.
    is_banned = db.Column(db.Boolean, nullable=False, default=False)

    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def average_rating(self):
        # Rating is defined further down in this same file - that's fine,
        # this function's BODY only runs later, at request time, by which
        # point the whole module (including Rating) has finished loading.
        avg = db.session.query(func.avg(Rating.stars)).filter(Rating.ratee_id == self.id).scalar()
        return round(avg, 1) if avg is not None else None

    def to_public_dict(self):
        # What the frontend is allowed to see about a user - notably
        # NEVER includes password_hash, even hashed.
        from app.sockets import get_online_user_ids  # deferred - see HelpRequest.to_public_dict for why
        return {
            'id': self.id,
            'fullname': self.fullname,
            'email': self.email,
            'country': self.country,
            'grade': self.grade,
            'language': self.language,
            'bio': self.bio,
            'photo': self.photo_data,
            'points': self.points,
            'diamonds': self.diamonds,
            'streak': self.current_streak_days,
            'rating': self.average_rating(),
            'online': self.id in get_online_user_ids(),
            'isAdmin': self.is_admin,
        }

    def to_limited_public_dict(self):
        # What a chat partner (or group member) is allowed to see when they
        # click someone's name to view their profile - deliberately NOT the
        # same as to_public_dict(): no email, no points/diamonds/streak/
        # rating, nothing gamification-related. Just enough to know who
        # you're talking to.
        return {
            'id': self.id,
            'fullname': self.fullname,
            'country': self.country,
            'photo': self.photo_data,
            'bio': self.bio,
            'isAdmin': self.is_admin,
        }


class StudySession(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    # The person the points/diamonds for THIS session go to.
    learner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    # Who they studied with - optional, since a group session has several
    # other people, not one single partner captured this way.
    partner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    subject = db.Column(db.String(120))
    topic = db.Column(db.String(120))
    level = db.Column(db.String(60))
    # 'learn', 'teach', or 'group' - decides which point rule applies.
    mode = db.Column(db.String(20), nullable=False)

    started_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    ended_at = db.Column(db.DateTime)
    minutes = db.Column(db.Integer)

    def to_public_dict(self):
        return {
            'id': self.id,
            'subject': self.subject,
            'topic': self.topic,
            'level': self.level,
            'mode': self.mode,
            'started_at': self.started_at.isoformat(),
            'ended_at': self.ended_at.isoformat() if self.ended_at else None,
            'minutes': self.minutes,
        }

    def has_participant(self, user_id):
        # A 1-on-1 session's two people are learner_id/partner_id directly;
        # a group session's members live in GroupMembership instead - this
        # is the ONE place that distinguishes them, shared by every route
        # and socket handler that needs "can this person see/use this
        # session" so they can never disagree with each other.
        if user_id in (self.learner_id, self.partner_id):
            return True
        if self.mode == 'group':
            return GroupMembership.query.filter_by(session_id=self.id, user_id=user_id).first() is not None
        return False


class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('study_session.id'), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    text = db.Column(db.Text, nullable=False)
    # A data: URI (e.g. "data:image/jpeg;base64,...") - same storage
    # pattern as User.photo_data. Nullable - only set for a real image
    # message (see routes/sessions.py's send_image, which runs a Gemini
    # safety check BEFORE this row is ever created, so nothing unsafe is
    # ever stored or shown at all).
    image_data = db.Column(db.Text, nullable=True)
    # Soft-delete, like WhatsApp's "This message was deleted" - the
    # original text/image gets REPLACED (not just hidden client-side), so
    # deleting something actually removes it from what to_public_dict ever
    # sends out again, not just from one person's current screen.
    deleted = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def to_public_dict(self):
        sender = db.session.get(User, self.sender_id)
        return {
            'id': self.id,
            'sessionId': self.session_id,
            'senderId': self.sender_id,
            'senderName': sender.fullname if sender else 'Unknown',
            'text': '' if self.deleted else self.text,
            'imageData': None if self.deleted else self.image_data,
            'deleted': self.deleted,
            'createdAt': self.created_at.isoformat(),
        }


class MessageReadState(db.Model):
    # WhatsApp-style read ticks - tracked as "the newest message THIS
    # person has seen in THIS chat," not one row per (message, reader)
    # pair. A single number per person, updated as they read further, is
    # both much lighter than per-message tracking and matches how these
    # tick marks actually behave everywhere else: every message up to
    # that point counts as read together, not individually.
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('study_session.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    last_read_message_id = db.Column(db.Integer, db.ForeignKey('message.id'), nullable=False)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    __table_args__ = (
        db.UniqueConstraint('session_id', 'user_id', name='uq_message_read_state_session_user'),
    )


class GroupMembership(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('study_session.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    joined_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def to_public_dict(self):
        # Deferred import - sockets.py imports FROM this module, so this
        # can't be a top-level import without creating a circular import;
        # by the time this function actually RUNS (a real request), the
        # whole app (sockets.py included) has already finished loading.
        from app.sockets import get_online_user_ids
        user = db.session.get(User, self.user_id)
        return {
            'userId': self.user_id,
            'fullname': user.fullname if user else 'Unknown',
            'photo': user.photo_data if user else None,
            'online': self.user_id in get_online_user_ids(),
            'isAdmin': bool(user and user.is_admin),
        }


class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)  # recipient
    # 'session_invite' (a real 1-on-1 match started), 'group_joined'
    # (someone joined your group), or 'rating' (someone rated you).
    type = db.Column(db.String(30), nullable=False)
    message = db.Column(db.Text, nullable=False)
    # Nullable - only set for the actionable types, so the frontend knows
    # which session to reconstruct a link to when this is clicked.
    session_id = db.Column(db.Integer, db.ForeignKey('study_session.id'), nullable=True)
    read = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def to_public_dict(self):
        return {
            'id': self.id,
            'type': self.type,
            'message': self.message,
            'sessionId': self.session_id,
            'read': self.read,
            'createdAt': self.created_at.isoformat(),
        }


class UnlockedAchievement(db.Model):
    # This row existing means the achievement is at least ELIGIBLE (its
    # condition has been met, or - for perfect_quiz - quiz.js reported a
    # perfect score). `claimed` is a separate step: like most game apps,
    # meeting the condition only makes the reward available to tap - the
    # actual points/diamonds/badge aren't granted until the person opens
    # Achievements and claims it themselves.
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    key = db.Column(db.String(40), nullable=False)  # matches a key in app/achievements.py's ACHIEVEMENTS
    unlocked_at = db.Column(db.DateTime, nullable=False, default=utcnow)  # when it became eligible
    claimed = db.Column(db.Boolean, nullable=False, default=False)
    claimed_at = db.Column(db.DateTime, nullable=True)

    __table_args__ = (
        # Stops the same achievement from ever being tracked twice for the
        # same person - both the "became eligible" and "claim" logic rely
        # on this row simply existing (or not) as their check.
        db.UniqueConstraint('user_id', 'key', name='uq_unlocked_achievement_user_key'),
    )


class SessionSummary(db.Model):
    # A real Gemini-generated mind map + summary, cached per session so a
    # second visit to the AI Summary screen (or clicking Back and forward
    # again) reuses this instead of paying for another API call.
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('study_session.id'), nullable=False, unique=True)
    central_topic = db.Column(db.String(120), nullable=False)
    branches = db.Column(db.JSON, nullable=False)  # list of exactly 3 {label, detail} objects
    summary_points = db.Column(db.JSON, nullable=False)  # list of strings
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def to_public_dict(self):
        return {
            'available': True,
            'centralTopic': self.central_topic,
            'branches': self.branches,
            'summaryPoints': self.summary_points,
        }


class QuizSet(db.Model):
    # A real Gemini-generated quiz for a topic outside quiz.js's built-in
    # ~10-topic question bank. Cached by topic so the SAME topic asked by
    # a different person (or the same person again) doesn't burn another
    # AI request - see app/quiz_generator.py.
    id = db.Column(db.Integer, primary_key=True)
    subject = db.Column(db.String(120))
    topic = db.Column(db.String(120), nullable=False)
    level = db.Column(db.String(60))
    questions = db.Column(db.JSON, nullable=False)  # list of {q, options (4 strings), correct (0-3)}
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def to_public_dict(self):
        return {'available': True, 'questions': self.questions}


class HelpRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    # 'learn' = "I need help with this", 'teach' = "I want to teach this" -
    # the OPPOSITE of whoever acts on it (helping someone learn means YOU
    # teach them, and vice versa).
    mode = db.Column(db.String(20), nullable=False)
    subject = db.Column(db.String(120))
    topic = db.Column(db.String(120))
    level = db.Column(db.String(60))
    status = db.Column(db.String(20), nullable=False, default='open')  # 'open' or 'fulfilled'
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def to_public_dict(self):
        # Deferred import - see GroupMembership.to_public_dict for why
        # this can't be a top-level import in this file.
        from app.sockets import get_online_user_ids
        user = db.session.get(User, self.user_id)
        return {
            'id': self.id,
            'userId': self.user_id,
            'fullname': user.fullname if user else 'Unknown',
            'country': user.country if user else None,
            'mode': self.mode,
            'subject': self.subject,
            'topic': self.topic,
            'level': self.level,
            'createdAt': self.created_at.isoformat(),
            'online': self.user_id in get_online_user_ids(),
        }


class Rating(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('study_session.id'), nullable=False)
    rater_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    # Nullable as a safety net (never actually null in practice - every
    # match is a real account). ratee_name keeps a readable name either
    # way, so the rating stays meaningful to display regardless.
    ratee_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    ratee_name = db.Column(db.String(120))
    stars = db.Column(db.Integer, nullable=False)
    badge_text = db.Column(db.String(120), nullable=False)
    # The free-text "Comment" box on rate-partner.html - existed in the
    # UI already but was never actually sent/saved anywhere until now.
    comment = db.Column(db.Text, nullable=True)
    # Set only for a low rating (see rate-partner.js's follow-up "what
    # went wrong" screen) - a list of short reason strings picked from a
    # fixed set of common issues, e.g. ["Partner was unprepared", "Explanations weren't clear"].
    # Nullable/empty for anything that was never asked (a good rating) or
    # was asked and skipped.
    feedback_reasons = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)


class SupportMessage(db.Model):
    # A real "Contact support" submission (Help & Support / Safety Center's
    # Contact support button) - no admin dashboard exists yet to READ these,
    # but the submission itself is genuinely saved rather than a fake
    # alert(), same "real, not fake" bar as everything else in this app.
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    message = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def to_public_dict(self):
        user = db.session.get(User, self.user_id)
        return {
            'id': self.id,
            'fullname': user.fullname if user else 'Unknown',
            'email': user.email if user else None,
            'message': self.message,
            'createdAt': self.created_at.isoformat(),
        }


class Block(db.Model):
    # A real, persisted block - session.js/group-chat.js's "Block" button
    # used to just show an alert() and forget about it. blocker_id blocked
    # blocked_id; matching.py excludes a pair in EITHER direction (if
    # either side blocked the other, neither should ever be matched with
    # or shown the other again).
    id = db.Column(db.Integer, primary_key=True)
    blocker_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    blocked_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    __table_args__ = (db.UniqueConstraint('blocker_id', 'blocked_id', name='uq_block_pair'),)

    def to_public_dict(self):
        user = db.session.get(User, self.blocked_id)
        return {
            'id': self.id,
            'userId': self.blocked_id,
            'fullname': user.fullname if user else 'Unknown',
            'country': user.country if user else None,
            'blockedAt': self.created_at.isoformat(),
        }


class Report(db.Model):
    # A real, persisted report - the "Report" button in session.js/
    # group-chat.js used to just show an alert() and forget about it, same
    # as Block used to. session_id is nullable (a report could theoretically
    # come from somewhere with no session context) but is always set today.
    id = db.Column(db.Integer, primary_key=True)
    reporter_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    reported_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    session_id = db.Column(db.Integer, db.ForeignKey('study_session.id'), nullable=True)
    # Not free text from the reporter today (the confirm dialog is a single
    # "Report for inappropriate behavior?" button) - kept as a real column
    # so a more detailed reason can be added later without a new migration.
    reason = db.Column(db.Text, nullable=True)
    reviewed = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def to_public_dict(self):
        reporter = db.session.get(User, self.reporter_id)
        reported = db.session.get(User, self.reported_id)
        return {
            'id': self.id,
            'reporterName': reporter.fullname if reporter else 'Unknown',
            'reportedId': self.reported_id,
            'reportedName': reported.fullname if reported else 'Unknown',
            'sessionId': self.session_id,
            'reason': self.reason,
            'reviewed': self.reviewed,
            'createdAt': self.created_at.isoformat(),
        }
