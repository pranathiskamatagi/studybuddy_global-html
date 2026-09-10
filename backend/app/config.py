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
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    CORS_ORIGIN = os.environ.get('CORS_ORIGIN')
    # Server-side only - never sent to the frontend. Used by app/ai_summary.py
    # to call the Gemini API for real mind maps/summaries.
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
