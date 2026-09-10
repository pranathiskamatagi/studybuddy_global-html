"""
Proves the exact rule that kept breaking: if person A is about to land on
Match Found with B - however they got there - B must ALWAYS end up
matched/redirected too, with zero click, zero acceptance needed from B,
even if the live push to B is missed. There are TWO separate code paths
that can put A on Match Found, and each one needed its OWN fix:

  1. The generic subject search (choose-subject.html -> connecting.html's
     match-candidate polling loop) - fixed via the /matched-with-me
     pending-match backup.
  2. Clicking a real community request directly (Home's "Help her"/"Join"
     buttons - connecting.js's `withName` shortcut, which skips
     match-candidate ENTIRELY since the partner is already known) - this
     one used to notify nobody at all, leaving B (who posted the request
     and is waiting on their own connecting.html) stuck forever. Fixed via
     the /announce-match endpoint.

This is a real end-to-end check against a REAL running backend (not a mock),
using brand-new throwaway accounts it creates and deletes itself. It is NOT
wired into any CI/build step - run it by hand any time after changing
matching.py, sockets.py, or connecting.js to confirm both rules still hold:

    (from the backend/ folder, with the real server already running)
    ./venv/Scripts/python.exe tests/verify_mutual_match.py

Exits with a non-zero status and a clear FAILED line if either rule breaks.
"""
import os
import sys
import time

import requests
import socketio

# Makes `from app import ...` work no matter how this script is invoked
# (double-clicked, run from tests/, run from backend/) - Python only adds
# the SCRIPT's own folder to sys.path by default, not backend/ itself.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE = 'http://127.0.0.1:5000'
API = BASE + '/api'
TEST_A_EMAIL = '_verify_mutual_match_a@example.com'
TEST_B_EMAIL = '_verify_mutual_match_b@example.com'
TEST_C_EMAIL = '_verify_mutual_match_c@example.com'
TEST_D_EMAIL = '_verify_mutual_match_d@example.com'
PASSWORD = 'testpass123'


def signup_or_login(email, fullname):
    r = requests.post(API + '/auth/signup', json={
        'email': email, 'password': PASSWORD, 'fullname': fullname,
        'country': 'Testland', 'grade': '10', 'language': 'English',
    })
    if r.status_code in (400, 409):
        r = requests.post(API + '/auth/login', json={'email': email, 'password': PASSWORD})
    r.raise_for_status()
    data = r.json()
    return data['token'], data['user']['id']


def cleanup():
    """Deletes ONLY the two throwaway accounts this script itself just
    created (matched by their exact test email addresses) - never touches
    any real account. Talks to the database directly rather than the API,
    since there's no "delete my own account" endpoint (and shouldn't be
    one just for this)."""
    from app import create_app
    from app.extensions import db
    from app.models import User, HelpRequest

    app = create_app()
    with app.app_context():
        for email in (TEST_A_EMAIL, TEST_B_EMAIL, TEST_C_EMAIL, TEST_D_EMAIL):
            user = User.query.filter_by(email=email).first()
            if user:
                HelpRequest.query.filter_by(user_id=user.id).delete()
                db.session.delete(user)
        db.session.commit()


def check_generic_search_race(failures):
    """Scenario 1: both people search choose-subject.html's generic flow -
    the match-candidate polling loop."""
    tokenA, idA = signup_or_login(TEST_A_EMAIL, 'VerifyA')
    tokenB, idB = signup_or_login(TEST_B_EMAIL, 'VerifyB')

    sioA = socketio.Client()
    sioB = socketio.Client()
    sioA.connect(BASE, auth={'token': tokenA})
    sioB.connect(BASE, auth={'token': tokenB})

    # Both must be actively on the matching screen right now - the strict
    # rule from app/sockets.py's searching_users.
    sioA.emit('start_searching')
    sioB.emit('start_searching')
    time.sleep(0.5)

    # B has a real, currently-open request to teach this subject.
    requests.post(API + '/help-requests', json={
        'mode': 'teach', 'subject': 'VerifySubject', 'topic': 'VerifySubject',
    }, headers={'Authorization': f'Bearer {tokenB}'}).raise_for_status()

    # A's own search finds B. This is the moment a live 'matched_with_you'
    # push goes to B - deliberately NOT listened for here, to simulate the
    # push being missed (a dropped message, a bad-timing reconnect).
    r = requests.get(API + '/match-candidate', params={
        'subject': 'VerifySubject', 'topic': 'VerifySubject', 'mode': 'learn',
    }, headers={'Authorization': f'Bearer {tokenA}'})
    candidate = r.json().get('candidate')
    if not candidate or candidate.get('id') != idB:
        failures.append('[generic search] A did not get matched with B at all - matching itself is broken.')

    # Real behavior: A reaches Match Found and leaves the search pool.
    sioA.emit('stop_searching')
    time.sleep(0.5)

    # Prove the race is real: B's OWN poll can never rediscover A once A
    # has left the pool.
    r = requests.get(API + '/match-candidate', params={
        'subject': 'VerifySubject', 'topic': 'VerifySubject', 'mode': 'teach',
    }, headers={'Authorization': f'Bearer {tokenB}'})
    if r.json().get('candidate') is not None:
        failures.append('[generic search] Unexpected: B\'s own poll found a candidate - the race this test checks for isn\'t happening, which is fine, but means this test needs updating.')

    # THE ACTUAL RULE UNDER TEST: even though B's own poll can't find A,
    # and B never received the live push, B's next regular poll cycle
    # (connecting.js calling this after every match-candidate check) must
    # still recover the match.
    r = requests.get(API + '/matched-with-me', headers={'Authorization': f'Bearer {tokenB}'})
    match = r.json().get('match')
    if not match or match.get('partnerId') != idA:
        failures.append('[generic search] FAILED: B never got the pending match back from /matched-with-me - the auto-redirect rule is broken again.')

    sioA.disconnect()
    sioB.disconnect()


def check_community_request_click(failures):
    """Scenario 2: C clicks a real community request card (Home's "Help
    her"/"Join" buttons) that D posted - connecting.js's `withName`
    shortcut, which skips match-candidate entirely since the partner is
    already known. D is waiting on their OWN connecting.html the whole
    time and must still get pulled in, with no click from D."""
    tokenC, idC = signup_or_login(TEST_C_EMAIL, 'VerifyC')
    tokenD, idD = signup_or_login(TEST_D_EMAIL, 'VerifyD')

    sioD = socketio.Client()
    sioD.connect(BASE, auth={'token': tokenD})
    sioD.emit('start_searching')
    time.sleep(0.5)

    # C clicks D's community request card - exactly what connecting.js's
    # withName branch now does before jumping to Match Found.
    r = requests.post(API + '/announce-match', json={
        'partnerId': idD, 'subject': 'VerifySubject', 'topic': 'VerifySubject', 'mode': 'teach',
    }, headers={'Authorization': f'Bearer {tokenC}'})
    if r.status_code != 200:
        failures.append(f'[community request] announce-match failed: {r.status_code} {r.text}')

    # D's own connecting.html polling loop should recover this via the
    # SAME /matched-with-me fallback.
    r = requests.get(API + '/matched-with-me', headers={'Authorization': f'Bearer {tokenD}'})
    match = r.json().get('match')
    if not match or match.get('partnerId') != idC:
        failures.append('[community request] FAILED: D never got the pending match back - clicking a community request leaves the other person stuck again.')

    sioD.disconnect()


def main():
    failures = []
    check_generic_search_race(failures)
    check_community_request_click(failures)
    cleanup()

    if failures:
        print('\n'.join('FAILED: ' + f for f in failures))
        sys.exit(1)
    print('PASSED: matching is truly mutual in both flows - nobody needs to click/accept anything.')


if __name__ == '__main__':
    main()
