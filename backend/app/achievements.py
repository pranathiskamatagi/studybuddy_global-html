# A central place for what each achievement means and how to check it -
# every condition is DERIVED from existing real data (session counts,
# points, distinct partners taught) rather than kept as its own separate
# counter, so there's nothing new to keep in sync as sessions/ratings
# happen elsewhere in the app. 'perfect_quiz' is the one exception: quiz.js
# has no other backend trail (the question bank is 100% client-side), so
# it's reported directly instead of computed here.
#
# Like most game apps, meeting a condition only makes an achievement
# ELIGIBLE - the real reward (points/diamonds/badge) is only granted once
# the person actually taps "Claim" on the achievements screen. See
# check_and_notify_eligible() (called after anything that could newly
# satisfy a condition) vs claim_achievement() (called when they tap it).

from app.extensions import db
from app.models import User, StudySession, UnlockedAchievement, utcnow
from app.notification_helpers import create_notification

ACHIEVEMENTS = {
    'first_session': {
        'title': 'First Session',
        'description': 'Complete your first study session',
        'target': 1,
        'reward_points': 20,
        'reward_diamonds': 0,
        'reward_text': '+20 coins',
    },
    'perfect_quiz': {
        'title': 'Perfect Quiz',
        'description': 'Score 5/5 on any teaching quiz',
        'target': 1,
        'reward_points': 30,
        'reward_diamonds': 0,
        'reward_text': '+30 coins',
    },
    'top_10_leaderboard': {
        'title': 'Top 10 Leaderboard',
        'description': 'Reach the top 10 on the leaderboard',
        'target': 1,
        'reward_points': 0,
        'reward_diamonds': 0,
        'reward_text': '🏆 Champion badge',
    },
    'points_1000': {
        'title': '1,000 Coins Club',
        'description': 'Earn 1,000+ total coins',
        'target': 1000,
        'reward_points': 0,
        'reward_diamonds': 2,
        'reward_text': '+2 diamonds',
    },
    'session_streak_5': {
        'title': '5-Session Streak',
        'description': 'Complete 5 study sessions',
        'target': 5,
        'reward_points': 50,
        'reward_diamonds': 0,
        'reward_text': '+50 coins',
    },
    'community_helper_10': {
        'title': 'Community Helper',
        'description': 'Help 10 different students',
        'target': 10,
        'reward_points': 0,
        'reward_diamonds': 0,
        'reward_text': '🎖️ Helper badge',
    },
}

def _community_helped_count(user_id):
    # Distinct real people this user has TAUGHT (mode='teach', session
    # actually ended) - matches the 'teach' role the rest of the backend
    # already uses everywhere else (start_session, gamification points).
    return (
        db.session.query(StudySession.partner_id)
        .filter(StudySession.learner_id == user_id)
        .filter(StudySession.mode == 'teach')
        .filter(StudySession.ended_at.isnot(None))
        .filter(StudySession.partner_id.isnot(None))
        .distinct()
        .count()
    )


def _leaderboard_rank_ok(user):
    better_count = User.query.filter(User.points > user.points).count()
    return better_count < 10


def _current_value(key, user):
    if key == 'first_session' or key == 'session_streak_5':
        return user.completed_session_count
    if key == 'points_1000':
        return user.points
    if key == 'community_helper_10':
        return _community_helped_count(user.id)
    if key == 'top_10_leaderboard':
        return 1 if _leaderboard_rank_ok(user) else 0
    if key == 'perfect_quiz':
        return 0  # not derivable - see report_perfect_quiz
    raise ValueError(f'Unknown achievement key: {key}')


def _condition_met(key, user):
    if key == 'perfect_quiz':
        return False  # only ever made eligible via report_perfect_quiz
    return _current_value(key, user) >= ACHIEVEMENTS[key]['target']


def get_status(key, user, row=None):
    """Returns (current, target, claimed, claimable) for one achievement -
    `row` is that user's UnlockedAchievement for this key, if it exists
    (pass it in when you already fetched it, to avoid N+1 queries)."""
    target = ACHIEVEMENTS[key]['target']
    claimed = bool(row and row.claimed)

    if key == 'perfect_quiz':
        current = 1 if row else 0
        claimable = bool(row) and not claimed
        return current, target, claimed, claimable

    current = min(_current_value(key, user), target)
    claimable = (not claimed) and _condition_met(key, user)
    return current, target, claimed, claimable


def check_and_notify_eligible(user_id):
    """Call after anything that could newly satisfy a condition (a session
    ending, a rating being submitted). Does NOT grant any reward - it only
    marks an achievement eligible (creates the UnlockedAchievement row,
    unclaimed) and tells the person it's ready to claim. 'perfect_quiz' is
    skipped - it has no derivable condition, see report_perfect_quiz()."""
    user = db.session.get(User, user_id)
    if not user:
        return

    existing_keys = {row.key for row in UnlockedAchievement.query.filter_by(user_id=user_id).all()}

    for key in ACHIEVEMENTS:
        if key == 'perfect_quiz' or key in existing_keys:
            continue
        if _condition_met(key, user):
            db.session.add(UnlockedAchievement(user_id=user_id, key=key))
            db.session.commit()
            title = ACHIEVEMENTS[key]['title']
            create_notification(user_id, 'achievement', f"{title} is ready to claim!")


def report_perfect_quiz(user_id):
    """Called directly by POST /api/achievements/report-perfect-quiz - marks
    'perfect_quiz' eligible (not claimed yet). Idempotent: a second report
    for the same user is a no-op, whether or not it's been claimed since."""
    existing = UnlockedAchievement.query.filter_by(user_id=user_id, key='perfect_quiz').first()
    if existing:
        return False
    db.session.add(UnlockedAchievement(user_id=user_id, key='perfect_quiz'))
    db.session.commit()
    create_notification(user_id, 'achievement', 'Perfect Quiz is ready to claim!')
    return True


def claim_achievement(user_id, key):
    """Called when the person taps an achievement on the Achievements
    screen. Re-validates eligibility server-side (never trusts the client)
    before granting the real reward - returns (user, error_message)."""
    if key not in ACHIEVEMENTS:
        return None, 'Unknown achievement.'

    user = db.session.get(User, user_id)
    if not user:
        return None, 'User not found.'

    row = UnlockedAchievement.query.filter_by(user_id=user_id, key=key).first()
    if row and row.claimed:
        return None, 'Already claimed.'

    if key == 'perfect_quiz':
        if not row:
            return None, 'Not eligible yet.'
    else:
        if not _condition_met(key, user):
            return None, 'Not eligible yet.'
        if not row:
            row = UnlockedAchievement(user_id=user_id, key=key)
            db.session.add(row)

    definition = ACHIEVEMENTS[key]
    row.claimed = True
    row.claimed_at = utcnow()
    user.points += definition['reward_points']
    user.diamonds += definition['reward_diamonds']
    db.session.commit()

    return user, None
