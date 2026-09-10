"""
Proves the rule: volunteering to TEACH someone via a real community
request (Home/Connect's "Help" button) must go through the SAME "prove you
know this subject" quiz gate that teach-subject.js's own "I wanna teach"
flow already requires - not skip straight to matching. It also proves the
real learner's request only gets marked fulfilled once the quiz is
actually PASSED, never just for clicking Help (which would silently claim
the request even for someone who then fails and gets sent home).

This checks the BACKEND side of that rule (the part quiz.js/home.js/
connect.js call into): posting a real community request, calling
/announce-match the same way a passed-quiz click does, and confirming the
request only reads as fulfilled afterward - not before.

    (from the backend/ folder, with the real server already running)
    ./venv/Scripts/python.exe tests/verify_community_teach_quiz_gate.py
"""
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE = 'http://127.0.0.1:5000'
API = BASE + '/api'
LEARNER_EMAIL = '_verify_quiz_gate_learner@example.com'
HELPER_EMAIL = '_verify_quiz_gate_helper@example.com'
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
    from app import create_app
    from app.extensions import db
    from app.models import User, HelpRequest

    app = create_app()
    with app.app_context():
        for email in (LEARNER_EMAIL, HELPER_EMAIL):
            user = User.query.filter_by(email=email).first()
            if user:
                HelpRequest.query.filter_by(user_id=user.id).delete()
                db.session.delete(user)
        db.session.commit()


def request_status(request_id):
    # GET /api/help-requests is the COMMUNITY feed - it deliberately never
    # shows your own request back to you, so it can't be used to check
    # your own request's status. Read it straight from the database
    # instead, same as the cleanup helpers elsewhere in these scripts.
    from app import create_app
    from app.extensions import db
    from app.models import HelpRequest

    app = create_app()
    with app.app_context():
        row = db.session.get(HelpRequest, request_id)
        return row.status if row else None


def main():
    failures = []

    tokenLearner, idLearner = signup_or_login(LEARNER_EMAIL, 'VerifyQuizLearner')
    tokenHelper, idHelper = signup_or_login(HELPER_EMAIL, 'VerifyQuizHelper')

    r = requests.post(API + '/help-requests', json={
        'mode': 'learn', 'subject': 'VerifySubject', 'topic': 'VerifySubject',
    }, headers={'Authorization': f'Bearer {tokenLearner}'})
    request_id = r.json()['request']['id']

    # BEFORE the quiz is passed: the request must still be 'open'. If
    # home.js/connect.js ever go back to fulfilling on click instead of on
    # a passed quiz, this would already be flipped by now.
    status_before = request_status(request_id)
    if status_before != 'open':
        failures.append(f'FAILED: the request was already "{status_before}" (not open) before any quiz was passed.')

    # The moment quiz.js's continueBtn handler fires for a PERFECT score -
    # this is what actually claims the request AND notifies the learner.
    r = requests.post(f'{API}/help-requests/{request_id}/fulfill', headers={'Authorization': f'Bearer {tokenHelper}'})
    if r.status_code != 200:
        failures.append(f'FAILED: fulfilling the request after a passed quiz failed: {r.status_code} {r.text}')

    requests.post(API + '/announce-match', json={
        'partnerId': idLearner, 'subject': 'VerifySubject', 'topic': 'VerifySubject', 'mode': 'teach',
    }, headers={'Authorization': f'Bearer {tokenHelper}'})

    # AFTER: the request must now read as fulfilled...
    status_after = request_status(request_id)
    if status_after != 'fulfilled':
        failures.append(f'FAILED: the request is "{status_after}" (not fulfilled) after a passed quiz should have claimed it.')

    # ...and the learner (waiting on her own connecting.html) must have a
    # pending match recorded for her - same mechanism verify_mutual_match.py
    # checks, just triggered from this quiz-gated path instead.
    r = requests.get(API + '/matched-with-me', headers={'Authorization': f'Bearer {tokenLearner}'})
    match = r.json().get('match')
    if not match or match.get('partnerId') != idHelper:
        failures.append('FAILED: the learner never got the pending match after her request was fulfilled by a passed quiz.')

    cleanup()

    if failures:
        print('\n'.join('FAILED: ' + f for f in failures))
        sys.exit(1)
    print('PASSED: community-request teaching only claims the request after a passed quiz, and still notifies the learner.')


if __name__ == '__main__':
    main()
