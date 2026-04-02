"""Google Calendar integration for dog training app."""
import json
import os
from datetime import datetime, timedelta

SCOPES = ['https://www.googleapis.com/auth/calendar.events']
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(BASE_DIR, 'token.json')
CREDENTIALS_FILE = os.path.join(BASE_DIR, 'credentials.json')


def get_calendar_service():
    """Get authenticated Google Calendar service."""
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDENTIALS_FILE):
                raise FileNotFoundError(
                    f'Missing {CREDENTIALS_FILE}. '
                    'Download it from Google Cloud Console > APIs & Services > Credentials.'
                )
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=8090)

        with open(TOKEN_FILE, 'w') as f:
            f.write(creds.to_json())

    return build('calendar', 'v3', credentials=creds)


def create_training_event(client_name, dog_name, date_str, time_str,
                          address='', plan=''):
    """Create a Google Calendar event for a training session.

    Args:
        client_name: Client's name
        dog_name: Dog's name
        date_str: Date in YYYY-MM-DD format
        time_str: Time in HH:MM format
        address: Optional location
        plan: Optional session plan for description
    Returns:
        dict with event id, link, and summary
    """
    service = get_calendar_service()

    start_dt = datetime.strptime(f'{date_str} {time_str}', '%Y-%m-%d %H:%M')
    end_dt = start_dt + timedelta(hours=1)

    event = {
        'summary': f'אילוף - {client_name} ({dog_name})',
        'location': address or '',
        'description': plan or '',
        'start': {
            'dateTime': start_dt.isoformat(),
            'timeZone': 'Asia/Jerusalem',
        },
        'end': {
            'dateTime': end_dt.isoformat(),
            'timeZone': 'Asia/Jerusalem',
        },
        'reminders': {
            'useDefault': False,
            'overrides': [
                {'method': 'popup', 'minutes': 24 * 60},  # 1 day before
                {'method': 'popup', 'minutes': 60},        # 1 hour before
            ],
        },
    }

    created = service.events().insert(calendarId='primary', body=event).execute()
    return {
        'id': created['id'],
        'link': created.get('htmlLink', ''),
        'summary': created['summary'],
    }


def is_authenticated():
    """Check if we have valid credentials."""
    if not os.path.exists(TOKEN_FILE):
        return False
    try:
        from google.oauth2.credentials import Credentials
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        return creds and creds.valid
    except Exception:
        return False
