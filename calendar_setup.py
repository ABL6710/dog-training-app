#!/usr/bin/env python3
"""One-time setup for Google Calendar integration.

Before running this:
1. Go to https://console.cloud.google.com/
2. Create a project (or use existing)
3. Enable "Google Calendar API"
4. Go to APIs & Services > Credentials
5. Create OAuth 2.0 Client ID (type: Desktop App)
6. Download the JSON and save it as 'credentials.json' in this directory
7. Run this script: python3 calendar_setup.py
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CREDENTIALS_FILE = os.path.join(BASE_DIR, 'credentials.json')

def main():
    if not os.path.exists(CREDENTIALS_FILE):
        print('\n❌ credentials.json not found!')
        print('\nFollow these steps:')
        print('1. Go to https://console.cloud.google.com/')
        print('2. Create a project (or use existing)')
        print('3. Enable "Google Calendar API"')
        print('4. Go to APIs & Services > Credentials')
        print('5. Create OAuth 2.0 Client ID (type: Desktop App)')
        print(f'6. Download the JSON and save it as:\n   {CREDENTIALS_FILE}')
        print('7. Run this script again')
        sys.exit(1)

    print('🔑 credentials.json found. Starting authentication...')
    print('A browser window will open for Google login.\n')

    try:
        from calendar_integration import get_calendar_service
        service = get_calendar_service()
        # Quick test: list next event
        events = service.events().list(
            calendarId='primary', maxResults=1, singleEvents=True,
            orderBy='startTime', timeMin='2026-01-01T00:00:00Z'
        ).execute()
        print('✅ Authentication successful!')
        print(f'   Calendar connected. Found {len(events.get("items", []))} upcoming event(s).')
        print('\n   You can now use the calendar button in the app.')
    except Exception as e:
        print(f'❌ Authentication failed: {e}')
        sys.exit(1)


if __name__ == '__main__':
    main()
