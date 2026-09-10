# The exact point/diamond rules the user specified (handwritten notes):
#   - +100 points for a LEARN session, +150 for a TEACH session.
#   - +1 diamond every 2 completed sessions.
#   - +1 BONUS diamond every 2 sessions that got a 5-star rating
#     (separate from the diamond above).
#   - +10 points to whoever submits a rating.
#   - Only sessions LONGER than 5 minutes count at all - a session that
#     ends sooner (someone testing, or leaving right away) shouldn't earn
#     points, a "completed session," or diamond/streak progress, or
#     you could farm rewards with a string of instant sessions.
# These are plain functions (not tied to Flask routes) so the math can be
# tested/read on its own, without needing a fake HTTP request to check it.

from datetime import date, timedelta

POINTS_FOR_LEARN = 100
POINTS_FOR_TEACH = 150
POINTS_FOR_RATING_SOMEONE = 10
SESSIONS_PER_DIAMOND = 2
FIVE_STAR_SESSIONS_PER_BONUS_DIAMOND = 2
MIN_MINUTES_FOR_POINTS = 5

# Awarded when Gemini reads the REAL chat transcript and judges that the
# teacher genuinely used the recommended techniques from
# teaching-tips.html - not a self-report checkbox, since there's no way
# to verify "I followed these tips" from a tick-box alone. See
# app/teaching_tips_check.py. The learner gets a smaller bonus too, for
# engaging well with a teacher who taught effectively.
TEACHING_TIPS_BONUS_FOR_TEACHER = 50
TEACHING_TIPS_BONUS_FOR_LEARNER = 30


def update_streak(user):
    """Call alongside award_session_points, for the SAME qualifying
    session (a session too short to earn points is also too short to
    count for the streak - same reasoning, no farming a streak with a
    string of instant sessions). Consecutive CALENDAR DAYS (UTC), not
    24-hour windows - studying at 11pm and again at 7am the next day
    still counts as two different days, same as Duolingo-style streaks
    everywhere else work."""
    today = date.today()
    if user.last_streak_date == today:
        return  # already studied today - a second session doesn't double-count
    if user.last_streak_date == today - timedelta(days=1):
        user.current_streak_days += 1  # picked up right where yesterday left off
    else:
        user.current_streak_days = 1  # first day, or the streak had already broken
    user.last_streak_date = today
    user.longest_streak_days = max(user.longest_streak_days, user.current_streak_days)


def award_session_points(user, mode, minutes):
    """Call once, when a session ENDS. Updates points/diamonds on `user`
    in place - the caller is responsible for saving (db.session.commit()).
    Does nothing at all if the session didn't last long enough. Returns
    True if a diamond was earned, so the caller can pop up a celebration
    for it (points aren't the only reward worth celebrating)."""
    if minutes is None or minutes <= MIN_MINUTES_FOR_POINTS:
        return False

    user.points += POINTS_FOR_TEACH if mode == 'teach' else POINTS_FOR_LEARN
    update_streak(user)

    user.completed_session_count += 1
    if user.completed_session_count % SESSIONS_PER_DIAMOND == 0:
        user.diamonds += 1
        return True
    return False


def award_rating(rater, ratee, stars):
    """Call once, when a rating is submitted. Updates points/diamonds on
    `rater` in place, and on `ratee` too IF they're a real account - a
    rating can still be submitted with only a `ratee_name` and no real
    account attached (see rate-partner.js), so `ratee` may be None. In
    that case only the rater's side happens.
    Returns True if the RATEE just earned a bonus diamond from this
    rating, so the caller can mention it in their notification."""
    rater.points += POINTS_FOR_RATING_SOMEONE

    if ratee and stars == 5:
        ratee.five_star_session_count += 1
        if ratee.five_star_session_count % FIVE_STAR_SESSIONS_PER_BONUS_DIAMOND == 0:
            ratee.diamonds += 1
            return True
    return False
