"""
Proves the rule behind "whenever I click Start Session it immediately says
the other person left the chat": once both people can reliably reach Match
Found together (see verify_mutual_match.py), BOTH can click "Start Session"
within moments of each other - before either side's own click has had time
to redirect the other away. Without a fix, that created TWO SEPARATE
StudySession rows, and the second one's live 'session_started' push yanked
whoever was already properly chatting in the FIRST session over to the
second one - tearing down their just-joined socket, which immediately fired
a spurious 'partner_left' on the session they were already correctly in.

POST /sessions now reuses whichever session already exists between this
exact pair (see sessions.py's start_session()) - checked here directly
against a REAL running backend, simulating both people clicking within
the same instant.

    (from the backend/ folder, with the real server already running)
    ./venv/Scripts/python.exe tests/verify_start_session_no_duplicate.py
"""
import os
import sys
import time

import requests
import socketio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE = 'http://127.0.0.1:5000'
API = BASE + '/api'
A_EMAIL = '_verify_dblclick_a@example.com'
B_EMAIL = '_verify_dblclick_b@example.com'
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


def cleanup(session_id):
    from app import create_app
    from app.extensions import db
    from app.models import User, HelpRequest, StudySession, Message

    app = create_app()
    with app.app_context():
        for email in (A_EMAIL, B_EMAIL):
            user = User.query.filter_by(email=email).first()
            if user:
                HelpRequest.query.filter_by(user_id=user.id).delete()
                db.session.delete(user)
        if session_id:
            session = db.session.get(StudySession, session_id)
            if session:
                Message.query.filter_by(session_id=session.id).delete()
                db.session.delete(session)
        db.session.commit()


def main():
    failures = []
    session_id = None

    tokenA, idA = signup_or_login(A_EMAIL, 'VerifyDblA')
    tokenB, idB = signup_or_login(B_EMAIL, 'VerifyDblB')

    # Start Session requires the partner to be genuinely online right now
    # (a real socket connection, not just a valid login) - same as a real
    # browser sitting on match-found.html with its presence socket open.
    sioA = socketio.Client()
    sioB = socketio.Client()
    sioA.connect(BASE, auth={'token': tokenA})
    sioB.connect(BASE, auth={'token': tokenB})
    time.sleep(0.5)

    # Both click Start Session at essentially the same moment - no delay
    # between these two calls, same as two real clicks arriving within a
    # second of each other.
    rA = requests.post(API + '/sessions', json={
        'mode': 'teach', 'subject': 'VerifySubject', 'topic': 'VerifySubject', 'partner_id': idB,
    }, headers={'Authorization': f'Bearer {tokenA}'})
    rB = requests.post(API + '/sessions', json={
        'mode': 'learn', 'subject': 'VerifySubject', 'topic': 'VerifySubject', 'partner_id': idA,
    }, headers={'Authorization': f'Bearer {tokenB}'})

    if rA.status_code not in (200, 201) or rB.status_code not in (200, 201):
        failures.append(f'FAILED: one of the two Start Session calls errored: A={rA.status_code} {rA.text}, B={rB.status_code} {rB.text}')
    else:
        sessionIdA = rA.json()['session']['id']
        sessionIdB = rB.json()['session']['id']
        session_id = sessionIdA
        if sessionIdA != sessionIdB:
            failures.append(f'FAILED: A and B ended up on TWO SEPARATE sessions ({sessionIdA} vs {sessionIdB}) - clicking Start Session at the same time creates a duplicate again, which is exactly what causes the spurious "partner left."')

    sioA.disconnect()
    sioB.disconnect()
    cleanup(session_id)

    if failures:
        print('\n'.join('FAILED: ' + f for f in failures))
        sys.exit(1)
    print('PASSED: both people clicking Start Session at once land on the SAME real session - no duplicate, no spurious "partner left."')


if __name__ == '__main__':
    main()
