"""
ReckonBot Application Entry Point
---------------------------------
This version extends your previous refactor with:

1. Public Marketing / Landing Site at '/'
2. Authenticated Operational Dashboard under '/dashboard'
3. Bot-specific dashboards under '/bots'
4. Unified Telemetry API:
      POST /api/bot1/telemetry   (ingest from ESP32 robot)
      GET  /api/bot1/state       (latest snapshot)
      GET  /api/bot1/events      (SSE stream of telemetry updates)
      GET  /api/bot1/stream      (optional camera proxy -> ESP32-CAM /stream)
5. Theme persistence via /set-theme
6. Global navigation + layout width injection
7. Optional camera proxy toggle via environment
8. BUILD_ID injection for cache-busting/version display
9. Graceful error handling reusing landing template styling
10. CORS-friendly JSON responses (light headers)

Environment Variables (optional):
  SECRET_KEY=override-secret
  CAMERA_PROXY_ENABLE=1
  CAMERA_HOST=http://10.54.239.221
  BUILD_ID=dev-2025-10-08
  FLASK_DEBUG=0|1
  FLASK_RUN_HOST=0.0.0.0
  FLASK_RUN_PORT=5000

Development:
  export FLASK_APP=app.py
  flask run --reload
Or:
  python app.py

Production (example):
  pip install gunicorn
  gunicorn 'app:create_app()'
"""

from __future__ import annotations
import os
import time
import json
import threading
from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Callable
from collections import deque

import requests
from flask import (
    Flask,
    render_template,
    url_for,
    Blueprint,
    request,
    g,
    jsonify,
    make_response,
    current_app,
    Response,
    stream_with_context,
)

# Gracefully load environment variables from .env if the package is available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# -----------------------------------------------------------------------------
# Dataclasses for Navigation
# -----------------------------------------------------------------------------

@dataclass
class NavItem:
    label: str
    href: str
    icon: str
    endpoint: str
    active: bool = False


@dataclass
class NavSection:
    title: str
    items: List[NavItem]


# -----------------------------------------------------------------------------
# Mock User (Replace with real auth later)
# -----------------------------------------------------------------------------

def get_mock_user() -> Dict[str, Any]:
    return {
        "name": "Mekesh",
        "email": "mekesh.engineer@gmail.com",
        "avatar_url": "https://images.unsplash.com/photo-1659482633369-9fe69af50bfb?auto=format&fit=facearea&facepad=3&w=160&h=160&q=80",
    }


# -----------------------------------------------------------------------------
# Global In-Memory Telemetry Store (simple, replace w/ Redis/DB later)
# -----------------------------------------------------------------------------

class TelemetryStore:
    """
    Thread-safe latest-value store + publish mechanism for SSE.
    """
    def __init__(self):
        self._lock = threading.RLock()
        self._latest: Dict[str, Any] = {}
        self._timestamp: float = 0.0
        self._sequence: int = 0
        self._recent_events = deque(maxlen=250)  # for optional debugging

        # Simple subscription list: each is a queue-like callback
        self._subscribers: List[Callable[[Dict[str, Any]], None]] = []

    def update(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            self._timestamp = time.time()
            self._sequence += 1
            enriched = {
                "seq": self._sequence,
                "received_ts": self._timestamp,
                **payload,
            }
            self._latest = enriched
            self._recent_events.append(enriched)
            subs = list(self._subscribers)
        # call subscribers outside lock
        for fn in subs:
            try:
                fn(enriched)
            except Exception:
                pass
        return enriched

    def latest(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._latest) if self._latest else {}

    def age(self) -> Optional[float]:
        with self._lock:
            if not self._timestamp:
                return None
            return time.time() - self._timestamp

    def subscribe(self, consumer: Callable[[Dict[str, Any]], None]) -> Callable[[], None]:
        with self._lock:
            self._subscribers.append(consumer)
        def unsubscribe():
            with self._lock:
                if consumer in self._subscribers:
                    self._subscribers.remove(consumer)
        return unsubscribe


telemetry_store = TelemetryStore()


# -----------------------------------------------------------------------------
# Blueprints
# -----------------------------------------------------------------------------

# Public / Landing blueprint (root)
public_bp = Blueprint("public", __name__)

@public_bp.route("/")
def landing():
    return render_template(
        "Landing/index.html",
        breadcrumb_current="Home",
        user=get_mock_user(),
    )


# Dashboard blueprint
dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/dashboard")

@dashboard_bp.route("/")
def index():
    return render_template(
        "dashboard/index.html",
        breadcrumb_current="Dashboard",
        user=get_mock_user(),
    )


# Bots blueprint (operational)
bots_bp = Blueprint("bots", __name__, url_prefix="/bots")

@bots_bp.route("/bot1/dashboard")
def bot1_dashboard():
    return render_template(
        "dashboard/bot1.html",
        breadcrumb_current="Bot 1 Dashboard",
        user=get_mock_user(),
    )

@bots_bp.route("/bot2/dashboard")
def bot2_dashboard():
    return render_template(
        "dashboard/bot2.html",
        breadcrumb_current="Bot 2 Dashboard",
        user=get_mock_user(),
    )

@bots_bp.route("/bot1/control")
def bot1_control():
    return render_template(
        "dashboard/index.html",
        breadcrumb_current="Bot 1 Control",
        user=get_mock_user(),
    )

@bots_bp.route("/bot2/control")
def bot2_control():
    return render_template(
        "dashboard/index.html",
        breadcrumb_current="Bot 2 Control",
        user=get_mock_user(),
    )

@bots_bp.route("/search")
def search_api():
    q = request.args.get("q", "").strip().lower()
    data = [
        {"title": "Dashboard", "icon": "bi-grid-fill", "link": url_for("dashboard.index")},
        {"title": "Bot 1 Dashboard", "icon": "bi-robot", "link": url_for("bots.bot1_dashboard")},
        {"title": "Bot 2 Dashboard", "icon": "bi-cpu", "link": url_for("bots.bot2_dashboard")},
        {"title": "Bot 1 Control", "icon": "bi-joystick", "link": url_for("bots.bot1_control")},
        {"title": "Bot 2 Control", "icon": "bi-controller", "link": url_for("bots.bot2_control")},
        {"title": "Settings", "icon": "bi-gear", "link": "#"},
    ]
    if not q:
        return jsonify(results=[])
    results = [row for row in data if q in row["title"].lower()]
    return jsonify(results=results)


# API blueprint for telemetry
api_bp = Blueprint("api", __name__, url_prefix="/api")

@api_bp.route("/bot1/telemetry", methods=["POST"])
def ingest_bot1_telemetry():
    """
    Expected JSON (numbers can be strings - will coerce):
    {
      "deviceId": "ESP32_ReckonBot_1",
      "distance": 23.4,
      "temperature": 28.1,
      "humidity": 54.9,
      "ir_obstacle": true,
      "mode": "auto",
      "servo": 90,
      "rssi": -65
    }
    """
    # Basic API key example (optional)
    required_key = current_app.config.get("INGEST_API_KEY")
    if required_key:
        provided = request.headers.get("X-API-Key")
        if not provided or provided != required_key:
            return jsonify(error="unauthorized"), 401

    payload = request.get_json(silent=True) or {}
    # Normalize numeric fields
    numeric_fields = ["distance", "temperature", "humidity", "servo", "rssi"]
    for f in numeric_fields:
        if f in payload:
            try:
                payload[f] = float(payload[f])
            except (TypeError, ValueError):
                payload[f] = None

    enriched = telemetry_store.update(payload)
    return jsonify(status="ok", seq=enriched.get("seq"))

@api_bp.route("/bot1/state", methods=["GET"])
def bot1_state():
    latest = telemetry_store.latest()
    age = telemetry_store.age()
    return jsonify(
        data=latest,
        age=age,
        stale=bool(age is not None and age > current_app.config.get("TELEMETRY_STALE_SECONDS", 15)),
        server_time=time.time(),
    )

@api_bp.route("/bot1/events", methods=["GET"])
def bot1_events():
    """
    SSE stream - pushes JSON payload when telemetry updates.
    """
    def event_stream():
        # Local queue for each subscriber
        queue: deque = deque()

        def push(update: Dict[str, Any]):
            queue.append(update)

        unsubscribe = telemetry_store.subscribe(push)
        # Immediately send current state if exists
        first = telemetry_store.latest()
        if first:
            yield f"data: {json.dumps(first)}\n\n"

        try:
            while True:
                if queue:
                    update = queue.popleft()
                    yield f"data: {json.dumps(update)}\n\n"
                else:
                    time.sleep(0.5)
        finally:
            unsubscribe()

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Content-Type": "text/event-stream; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
    }
    return Response(stream_with_context(event_stream()), headers=headers)

@api_bp.route("/bot1/stream", methods=["GET"])
def bot1_stream_proxy():
    """
    Optional MJPEG proxy for camera if direct cross-origin is undesirable.
    Streams chunks from CAMERA_HOST/stream.
    Enable via CAMERA_PROXY_ENABLE=1
    """
    if not current_app.config.get("CAMERA_PROXY_ENABLE"):
        return jsonify(error="Camera proxy disabled"), 404

    camera_host = current_app.config.get("CAMERA_HOST", "http://127.0.0.1")
    upstream = None
    try:
        upstream = requests.get(f"{camera_host.rstrip('/')}/stream", stream=True, timeout=5)
    except requests.RequestException as e:
        return jsonify(error=f"Upstream error: {e}"), 502

    def generate():
        try:
            for chunk in upstream.iter_content(chunk_size=1024):
                if not chunk:
                    continue
                yield chunk
        finally:
            upstream.close()

    return Response(
        stream_with_context(generate()),
        mimetype="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"},
    )


# -----------------------------------------------------------------------------
# Navigation
# -----------------------------------------------------------------------------

def build_navigation() -> List[NavSection]:
    endpoint = request.endpoint or ""
    return [
        NavSection(
            title="General",
            items=[
                NavItem(
                    label="Home",
                    href=url_for("public.landing"),
                    icon="bi-house-door-fill",
                    endpoint="public.landing",
                    active=endpoint == "public.landing",
                ),
                NavItem(
                    label="Dashboard",
                    href=url_for("dashboard.index"),
                    icon="bi-speedometer2",
                    endpoint="dashboard.index",
                    active=endpoint == "dashboard.index",
                ),
            ],
        ),
        NavSection(
            title="Bot Dashboards",
            items=[
                NavItem(
                    label="Bot 1 Dashboard",
                    href=url_for("bots.bot1_dashboard"),
                    icon="bi-robot",
                    endpoint="bots.bot1_dashboard",
                    active=endpoint == "bots.bot1_dashboard",
                ),
                NavItem(
                    label="Bot 2 Dashboard",
                    href=url_for("bots.bot2_dashboard"),
                    icon="bi-cpu",
                    endpoint="bots.bot2_dashboard",
                    active=endpoint == "bots.bot2_dashboard",
                ),
            ],
        ),
        NavSection(
            title="Remote Control",
            items=[
                NavItem(
                    label="Bot 1 Control",
                    href=url_for("bots.bot1_control"),
                    icon="bi-joystick",
                    endpoint="bots.bot1_control",
                    active=endpoint == "bots.bot1_control",
                ),
                NavItem(
                    label="Bot 2 Control",
                    href=url_for("bots.bot2_control"),
                    icon="bi-controller",
                    endpoint="bots.bot2_control",
                    active=endpoint == "bots.bot2_control",
                ),
            ],
        ),
    ]


# -----------------------------------------------------------------------------
# Context Processors & Hooks
# -----------------------------------------------------------------------------

def register_context_processors(app: Flask) -> None:
    @app.context_processor
    def inject_globals():
        theme = request.cookies.get("theme", "dark")
        return {
            "nav_sections": build_navigation(),
            "theme": theme,
            "content_max_width": current_app.config.get("CONTENT_MAX_WIDTH", 1280),
            "BUILD_ID": current_app.config.get("BUILD_ID", "dev"),
        }

    @app.before_request
    def load_user():
        # Replace with real authentication retrieval
        g.user = get_mock_user()

    @app.template_filter("upper_first")
    def upper_first(s: str):
        return s[:1].upper() + s[1:] if s else s


def register_error_handlers(app: Flask) -> None:
    def render_error(code: int, message: str):
        return (
            render_template(
                "Landing/index.html",
                breadcrumb_current="Home",
                user=get_mock_user(),
                error_message=message,
            ),
            code,
        )

    @app.errorhandler(404)
    def not_found(e):
        return render_error(404, "The page you are looking for was not found.")

    @app.errorhandler(500)
    def server_error(e):
        return render_error(500, "An unexpected server error occurred.")


def persist_theme(app: Flask):
    @app.route("/set-theme", methods=["POST"])
    def set_theme():
        data = request.get_json(silent=True) or {}
        theme = data.get("theme", "dark")
        if theme not in {"light", "dark"}:
            theme = "dark"
        resp = make_response({"status": "ok", "theme": theme})
        resp.set_cookie(
            "theme",
            theme,
            max_age=60 * 60 * 24 * 365,
            httponly=False,
            samesite="Lax",
        )
        return resp


# -----------------------------------------------------------------------------
# Application Factory
# -----------------------------------------------------------------------------

def create_app(config_overrides: Dict[str, Any] | None = None) -> Flask:
    app = Flask(
        __name__,
        static_folder="static",
        template_folder="templates",
    )

    app.config.update(
        {
            "APP_NAME": "ReckonBot",
            "SECRET_KEY": os.environ.get("SECRET_KEY", "dev-secret"),
            "PREFERRED_URL_SCHEME": "http",
            "CONTENT_MAX_WIDTH": 1280,
            "BUILD_ID": os.environ.get("BUILD_ID", "dev"),
            "CAMERA_PROXY_ENABLE": os.environ.get("CAMERA_PROXY_ENABLE", "0") == "1",
            "CAMERA_HOST": os.environ.get("CAMERA_HOST", "http://10.54.239.150"),
            "INGEST_API_KEY": os.environ.get("INGEST_API_KEY", ""),  # blank -> disabled
            "TELEMETRY_STALE_SECONDS": 15,
        }
    )
    if config_overrides:
        app.config.update(config_overrides)

    # Register blueprints
    app.register_blueprint(public_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(bots_bp)
    app.register_blueprint(api_bp)

    # Hooks & helpers
    register_context_processors(app)
    register_error_handlers(app)
    persist_theme(app)

    # Basic root redirect convenience (optional)
    @app.route("/robots.txt")
    def robots():
        return "User-agent: *\nDisallow:", 200, {"Content-Type": "text/plain"}

    return app


# -----------------------------------------------------------------------------
# Main Entrypoint
# -----------------------------------------------------------------------------

def main():
    app = create_app()
    app.run(
        host=os.environ.get("FLASK_RUN_HOST", "127.0.0.1"),
        port=int(os.environ.get("FLASK_RUN_PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG", "1") == "1",
    )

if __name__ == "__main__":
    main()