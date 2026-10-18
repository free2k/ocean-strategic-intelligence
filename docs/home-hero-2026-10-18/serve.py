"""Serve the actual frontend files in a read-only localhost layout preview."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
REVIEW = "/docs/home-hero-2026-10-18/"


class ReviewHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        allowed = path.startswith((REVIEW, "/intelligence/public/")) or path == "/intelligence/industry-topics.mjs"
        if not allowed or ".." in Path(path).parts:
            self.send_error(404)
            return
        super().do_GET()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 4188), partial(ReviewHandler, directory=str(ROOT)))
    print("http://127.0.0.1:4188" + REVIEW + "preview.html", flush=True)
    server.serve_forever()
