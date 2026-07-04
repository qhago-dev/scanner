#!/usr/bin/env python3
"""Demo server with frame capture endpoint for debugging."""

import http.server
import json
import base64
import os
from io import BytesIO
from PIL import Image
from urllib.parse import urlparse

CAPTURE_DIR = os.path.join(os.path.dirname(__file__), "captures")
os.makedirs(CAPTURE_DIR, exist_ok=True)

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/capture":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)

            for key in ["gray", "binary"]:
                if key in data:
                    img_data = base64.b64decode(data[key].split(",")[1])
                    img = Image.open(BytesIO(img_data))
                    path = os.path.join(CAPTURE_DIR, f"frame_{data['ts']}_{key}.png")
                    img.save(path)
                    print(f"[capture] Saved {path} ({img.size})")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == "/captures":
            files = sorted(os.listdir(CAPTURE_DIR))
            html = "<h2>Captured Frames</h2><ul>"
            for f in files:
                html += f'<li><a href="/captures/{f}"><img src="/captures/{f}" style="max-width:600px;border:1px solid #333;margin:4px"></a><br>{f}</li>'
            html += "</ul>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(html.encode())
        elif self.path.startswith("/captures/"):
            fname = self.path[len("/captures/"):]
            fpath = os.path.join(CAPTURE_DIR, fname)
            if os.path.exists(fpath):
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.end_headers()
                with open(fpath, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.end_headers()
        else:
            super().do_GET()

if __name__ == "__main__":
    http.server.HTTPServer(("0.0.0.0", 8765), Handler).serve_forever()
