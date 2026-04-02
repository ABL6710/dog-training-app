#!/usr/bin/env python3
"""Minimal server for dog training app. Run: python3 server.py"""
import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 5001
DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'clients.json')


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/data':
            self._send_json_file()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/save':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            data = json.loads(body)
            os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
            with open(DATA_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self._respond(200, {'ok': True})
        elif self.path == '/api/calendar/create':
            self._handle_calendar_create()
        elif self.path == '/api/calendar/status':
            self._handle_calendar_status()
        else:
            self.send_error(404)

    def _handle_calendar_create(self):
        try:
            from calendar_integration import create_training_event
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
            result = create_training_event(
                client_name=body['client_name'],
                dog_name=body['dog_name'],
                date_str=body['date'],
                time_str=body['time'],
                address=body.get('address', ''),
                plan=body.get('plan', ''),
            )
            self._respond(200, {'ok': True, 'event': result})
        except FileNotFoundError as e:
            self._respond(400, {'ok': False, 'error': str(e)})
        except Exception as e:
            self._respond(500, {'ok': False, 'error': str(e)})

    def _handle_calendar_status(self):
        try:
            from calendar_integration import is_authenticated
            self._respond(200, {'authenticated': is_authenticated()})
        except Exception:
            self._respond(200, {'authenticated': False})

    def _send_json_file(self):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self._respond(200, data)
        except FileNotFoundError:
            self._respond(200, {'clients': []})

    def _respond(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass


if __name__ == '__main__':
    print(f'Dog Training App running at http://localhost:{PORT}')
    HTTPServer(('localhost', PORT), Handler).serve_forever()
