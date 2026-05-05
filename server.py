"""
Výlety 2026 – sdílený server
Spusť: python server.py
Pak sdílej odkaz (IP adresa se vypíše) se spolužáky na stejné WiFi
"""
from http.server import HTTPServer, SimpleHTTPRequestHandler
import json, os, socket

LIKES_FILE = os.path.join(os.path.dirname(__file__), 'likes_data.json')

def load_likes():
    default_data = {'1': [], '2': [], '3': [], '4': []}
    if os.path.exists(LIKES_FILE):
        try:
            with open(LIKES_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Kontrola, zda jsou data v novém formátu (seznamy IP)
                if isinstance(data, dict) and all(isinstance(v, list) for v in data.values()):
                    return data
        except Exception:
            pass
    return default_data

def save_likes(data):
    with open(LIKES_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f)

class Handler(SimpleHTTPRequestHandler):

    def send_json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/likes':
            data = load_likes()
            # Pro frontend pošleme jen počty a informaci, co olajkovala tato IP
            client_ip = self.client_address[0]
            counts = {tid: len(ips) for tid, ips in data.items()}
            user_likes = {tid: (client_ip in ips) for tid in data.keys()}
            self.send_json(200, {'counts': counts, 'userLikes': user_likes})
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/like/'):
            trip_id = self.path.rstrip('/').split('/')[-1]
            client_ip = self.client_address[0]
            
            data = load_likes()
            if trip_id not in data:
                data[trip_id] = []
            
            if client_ip in data[trip_id]:
                # Pokud už IP v seznamu je, lajk odebereme (unlike)
                data[trip_id].remove(client_ip)
                action = 'unliked'
            else:
                # Pokud tam není, přidáme ji
                data[trip_id].append(client_ip)
                action = 'liked'
                
            save_likes(data)
            self.send_json(200, {
                'count': len(data[trip_id]), 
                'status': action,
                'isLiked': action == 'liked'
            })

    def log_message(self, fmt, *args):
        pass  # tiché logování

if __name__ == '__main__':
    PORT = 8765
    server = HTTPServer(('0.0.0.0', PORT), Handler)

    # Zjisti lokální IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = '127.0.0.1'

    print('=' * 50)
    print(f'  ✅  Server spuštěn!')
    print(f'  🖥️   Tvůj počítač:   http://localhost:{PORT}')
    print(f'  📱  Sdílej s třídou: http://{local_ip}:{PORT}')
    print('  (Ctrl+C pro zastavení)')
    print('=' * 50)
    server.serve_forever()
