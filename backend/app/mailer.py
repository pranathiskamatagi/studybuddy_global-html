# Sends plain emails over SMTP: password-reset codes, the welcome email,
# and new-device login alerts.
import smtplib
import threading
from email.message import EmailMessage

from flask import current_app

from app.config import Config


def email_is_configured():
    return bool(Config.SMTP_HOST and Config.SMTP_USER and Config.SMTP_PASSWORD)


def send_email(to_address, subject, body):
    """Sends in the background so a slow mail server never holds up the
    request. Errors are logged, never raised - the caller carries on the
    same way whether or not the email got out. Does nothing when no mail
    server is set up (e.g. local development)."""
    if not email_is_configured():
        return
    message = EmailMessage()
    message['Subject'] = subject
    message['From'] = f'Learnora <{Config.SMTP_FROM}>'
    message['To'] = to_address
    message.set_content(body)
    app = current_app._get_current_object()

    def _send():
        try:
            with smtplib.SMTP(Config.SMTP_HOST, Config.SMTP_PORT, timeout=20) as server:
                server.starttls()
                server.login(Config.SMTP_USER, Config.SMTP_PASSWORD)
                server.send_message(message)
        except Exception as error:  # noqa: BLE001 - best effort, see docstring
            app.logger.error('Could not send email: %s', error)

    threading.Thread(target=_send, daemon=True).start()
