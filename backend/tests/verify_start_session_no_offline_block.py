"""
Proves the rule behind the "am I on 1 id and the other's in an incognito
window - is THAT why it says the person left?" bug: Start Session used to
hard-fail with a 409 'partner_offline' if the partner's socket wasn't
showing as connected at that EXACT instant. That's the wrong check - a
genuinely present partner can still look "offline" for a moment on a
backgrounded/incognito tab (browsers slow-walk reconnects for tabs that
aren't focused), or right after any backend restart severs every open
connection at once. A false reading there used to immediately kick the
clicker into "they left, finding you someone else" before the real
partner ever got a chance to show up.

Start Session now ALWAYS creates (or reuses) the session regardless of
the partner's socket state, and relies on the SAME 'partner_joined' signal
(and the client-side waiting/grace-period timer in session.js) to confirm
they're actually there - checked here directly against a REAL running
backend: person A starts a session with B while B has ZERO active socket
connections at all, then B "reconnects" and joins.

    (from the backend/ folder, with the real server already running)
    ./venv/Scripts/python.exe tests/verify_start_session_no_offline_block.py
"""
import os
import sys
import time

import requests
import socketio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE = 'http://127.0.0.1:5000'
API = BASE + '/api'
A_EMAIL = '_verify_offline_start_a@example.com'
B_EMAIL = '_verify_offline_start_b@example.com'
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

    tokenA, idA = signup_or_login(A_EMAIL, 'VerifyOfflineA')
    tokenB, idB = signup_or_login(B_EMAIL, 'VerifyOfflineB')

    # A connects. B does NOT - simulating a backgrounded/incognito tab
    # whose socket hasn't reconnected yet (e.g. right after a restart).
    sioA = socketio.Client()
    sioA.connect(BASE, auth={'token': tokenA})
    time.sleep(0.3)

    r = requests.post(API + '/sessions', json={
        'mode': 'teach', 'subject': 'VerifySubject', 'topic': 'VerifySubject', 'partner_id': idB,
    }, headers={'Authorization': f'Bearer {tokenA}'})

    if r.status_code not in (200, 201):
        failures.append(f'FAILED: Start Session still hard-blocks on a not-currently-connected partner: {r.status_code} {r.text}')
    else:
        session_id = r.json()['session']['id']
        sioA.emit('join', {'session_id': session_id})
        time.sleep(0.3)

        # B "reconnects" and joins - A's socket must hear about it, since
        # that's the exact signal session.js's waiting state depends on.
        received = []
        sioA.on('partner_joined', lambda data: received.append(data))
        sioB = socketio.Client()
        sioB.connect(BASE, auth={'token': tokenB})
        sioB.emit('join', {'session_id': session_id})
        time.sleep(0.5)

        if not received or received[0].get('name') != 'VerifyOfflineB':
            failures.append('FAILED: A never got notified when B actually showed up - the waiting state would never clear.')

        sioB.disconnect()

    sioA.disconnect()
    cleanup(session_id)

    if failures:
        print('\n'.join('FAILED: ' + f for f in failures))
        sys.exit(1)
    print('PASSED: Start Session no longer hard-fails on a momentarily-disconnected partner, and still confirms when they actually arrive.')


if __name__ == '__main__':
    main()
