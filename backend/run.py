import os

from app import create_app
from app.extensions import socketio

app = create_app()

if __name__ == '__main__':
    # socketio.run (not app.run) - it wraps Flask's dev server so
    # WebSocket connections get upgraded correctly, which plain app.run()
    # doesn't know how to do.
    #
    # use_reloader=False: the auto-restart-on-file-change reloader kept
    # getting stuck in a restart loop in this environment, and every
    # restart silently drops every open chat connection - which is
    # exactly what looked like "the chat screen fluttering." Restart the
    # server yourself after changing backend code.
    #
    # debug reads from FLASK_DEBUG so a real deployment (Render sets this
    # to '0') never runs with Flask's debug mode on - debug mode exposes
    # an in-browser Python console, a real security hole on anything
    # actually reachable from the internet. Defaults to on for local dev,
    # same as before, since nothing needs to change for that.
    debug = os.environ.get('FLASK_DEBUG', '1') == '1'
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, debug=debug, use_reloader=False, host='0.0.0.0', port=port)
