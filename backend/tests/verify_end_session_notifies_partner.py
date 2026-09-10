"""
Proves the rule behind "the other person didn't leave the chat, he ended
the session - fix it, the other person should also get session ended":
when one participant deliberately clicks End Session, the OTHER person
must be told IMMEDIATELY and correctly ('partner_ended') - never treated
the same as an unexpected disconnect ('partner_left', which starts the
90-second reconnect-grace-period from verify_start_session_no_offline_block.py).
Those are two different situations and need two different signals.

Also proves a second, related bug found while fixing this: POST /sessions/
<id>/end used to only allow session.learner_id (whoever's "Start Session"
click happened to create the row) to end it at all - the PARTNER got a
403 trying to end their own session. Both real participants must be able
to end it, and each must be credited with the correct role's points (the
partner's role is always the OPPOSITE of the stored session.mode, same
convention used everywhere else in this codebase).

    (from the backend/ folder, with the real server already running)
    ./venv/Scripts/python.exe tests/verify_end_session_notifies_partner.py
"""
import os
import sys
import time

import requests
import socketio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE = 'http://127.0.0.1:5000'
API = BASE + '/api'
A_EMAIL = '_verify_endsession_a@example.com'  # the learner / session creator
B_EMAIL = '_verify_endsession_b@example.com'  # the partner
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

    tokenA, idA = signup_or_login(A_EMAIL, 'VerifyEndA')
    tokenB, idB = signup_or_login(B_EMAIL, 'VerifyEndB')

    sioA = socketio.Client()
    sioB = socketio.Client()
    sioA.connect(BASE, auth={'token': tokenA})
    sioB.connect(BASE, auth={'token': tokenB})
    time.sleep(0.3)

    r = requests.post(API + '/sessions', json={
        'mode': 'learn', 'subject': 'VerifySubject', 'topic': 'VerifySubject', 'partner_id': idB,
    }, headers={'Authorization': f'Bearer {tokenA}'})
    session_id = r.json()['session']['id']

    sioA.emit('join', {'session_id': session_id})
    sioB.emit('join', {'session_id': session_id})
    time.sleep(0.3)

    partner_left_seen = []
    partner_ended_seen = []
    sioA.on('partner_left', lambda data: partner_left_seen.append(data))
    sioA.on('partner_ended', lambda data: partner_ended_seen.append(data))

    # B is the PARTNER (not learner_id) - this used to be a hard 403.
    r = requests.post(f'{API}/sessions/{session_id}/end', json={'minutes': 15},
                       headers={'Authorization': f'Bearer {tokenB}'})
    if r.status_code != 200:
        failures.append(f'FAILED: the partner still cannot end their own session: {r.status_code} {r.text}')

    time.sleep(1)

    if partner_left_seen:
        failures.append('FAILED: A was shown the reconnect-grace-period signal for a DELIBERATE end - the exact bug being fixed.')
    if not partner_ended_seen:
        failures.append('FAILED: A never received the immediate "partner ended" signal at all.')

    # B's role is the OPPOSITE of the session's stored mode ('learn') -
    # so B should be credited as TEACH (150 points), not LEARN (100).
    from app import create_app
    from app.extensions import db
    from app.models import User
    app = create_app()
    with app.app_context():
        userA = User.query.filter_by(email=A_EMAIL).first()
        userB = User.query.filter_by(email=B_EMAIL).first()
        if userA.points != 100:
            failures.append(f'FAILED: A (learner, mode=learn) should have 100 points, has {userA.points}.')
        if userB.points != 150:
            failures.append(f'FAILED: B (partner, opposite role=teach) should have 150 points, has {userB.points}.')

    sioA.disconnect()
    sioB.disconnect()
    cleanup(session_id)

    if failures:
        print('\n'.join('FAILED: ' + f for f in failures))
        sys.exit(1)
    print('PASSED: either participant can end the session, both get correctly-credited points, and the OTHER side gets the real "ended" signal, not a false "waiting to reconnect".')


if __name__ == '__main__':
    main()
