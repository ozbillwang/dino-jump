"""Local dino runner. The browser owns the physics. Laya only picks jump, duck, or run."""

import json
import os
import queue
import threading
import time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
MODEL = Path(
    os.environ.get(
        "LAYA_MODEL",
        Path.home()
        / ".cache/huggingface/hub/models--aac6fef--laya-mlx/snapshots/20aed815fc6acde75733882e7ec0e3f28aeb9717",
    )
)
PORT = int(os.environ.get("PORT", "8876"))

jobs = queue.Queue()
status = {"ready": False, "error": None, "model": str(MODEL)}


def worker():
    try:
        import laya_mlx

        agent = laya_mlx.load(MODEL)
        status["ready"] = True
    except Exception as exc:
        status["error"] = str(exc)
        agent = None
    while True:
        state, questions, box = jobs.get()
        if agent is None:
            box.put({"error": status["error"] or "Model is not loaded."})
            continue
        started = time.perf_counter()
        try:
            result = agent.predict(state, questions)
            answer = result["answers"]["action"]
            box.put(
                {
                    "choice": answer["choice"],
                    "probabilities": answer["probabilities"],
                    "ms": round((time.perf_counter() - started) * 1000, 1),
                    "tokens": result["usage"]["input_tokens"],
                }
            )
        except Exception as exc:
            box.put({"error": str(exc)})


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/health":
            body = json.dumps(status).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        if self.path != "/decide":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            state = payload["state"]
            questions = payload["questions"]
        except (json.JSONDecodeError, KeyError, TypeError):
            self.send_error(400)
            return
        box = queue.Queue()
        jobs.put((state, questions, box))
        try:
            result = box.get(timeout=30)
        except queue.Empty:
            result = {"error": "The model did not answer in time."}
        code = 200 if "error" not in result else 503
        body = json.dumps(result).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if args and str(args[1]).startswith("2"):
            return
        super().log_message(fmt, *args)


if __name__ == "__main__":
    threading.Thread(target=worker, daemon=True).start()
    print(f"Dino Jump at http://127.0.0.1:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
