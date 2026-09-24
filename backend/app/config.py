import os
from datetime import timedelta
from dotenv import load_dotenv

# Reads the .env file in backend/ and makes its values available via
# os.environ.get() below - this is how secrets stay out of the code itself.
load_dotenv()


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY')
    # flask-jwt-extended defaults to just 15 minutes, which would log
    # someone out constantly during a normal study session - a week is
    # far more reasonable for this kind of app.
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)
    # Hosted Postgres providers hand out "postgres://..." URLs, which
    # SQLAlchemy no longer accepts - it wants "postgresql://...".
    SQLALCHEMY_DATABASE_URI = (os.environ.get('DATABASE_URL') or '').replace('postgres://', 'postgresql://', 1) or None
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    CORS_ORIGIN = os.environ.get('CORS_ORIGIN')
    # Server-side only - never sent to the frontend. Used by app/ai_summary.py
    # to call the Gemini API for real mind maps/summaries.
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
    # Web push: the private key signs each push so the browser's push
    # service trusts it came from this server; the public key is safe to
    # send to the frontend (it's what the browser uses to create a
    # subscription in the first place - see push.py).
    VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY')
    VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY')
    VAPID_CONTACT_EMAIL = os.environ.get('VAPID_CONTACT_EMAIL')
    # Outgoing email (reset codes, welcome email, new-device alerts). Any
    # SMTP provider works - e.g. Gmail with an "app password", or Brevo.
    SMTP_HOST = os.environ.get('SMTP_HOST')
    SMTP_PORT = int(os.environ.get('SMTP_PORT') or 587)
    SMTP_USER = os.environ.get('SMTP_USER')
    SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD')
    SMTP_FROM = os.environ.get('SMTP_FROM') or os.environ.get('SMTP_USER')
