"""
ReckonBot Application Entry Point
---------------------------------
Updated to:
  - Serve a public marketing / landing page at root '/'
  - Relocate the operational dashboard under '/dashboard'
  - Provide navigation linking to the dashboard
  - Keep existing bot routes under '/bots'
  - Maintain theme persistence and context injection

Run (development):
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
from dataclasses import dataclass
from typing import List, Dict, Any

from flask import (
    Flask,
    render_template,
    url_for,
    Blueprint,
    request,
    g,
    jsonify,
    make_response,
    redirect,
    current_app,  # added
)

# ---------------------------------------------------------------------------
# Dataclasses for Navigation
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Blueprints
# ---------------------------------------------------------------------------

# Public / Landing blueprint (root)
public_bp = Blueprint("public", __name__)

@public_bp.route("/")
def landing():
    """
    Public landing page (marketing site).
    If you later want to auto-redirect authenticated users to the dashboard,
    you could check `g.user` here and redirect accordingly.
    """
    return render_template(
        "landing/index.html",
        breadcrumb_current="Home",
        user=get_mock_user(),
    )

# Dashboard blueprint (moved under /dashboard)
dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/dashboard")

@dashboard_bp.route("/")
def index():
    return render_template(
        "dashboard/index.html",
        breadcrumb_current="Dashboard",
        user=get_mock_user(),
    )

# (Optional) Additional dashboard-related routes could go here:
# e.g. /dashboard/analytics, /dashboard/settings, etc.

# Bots blueprint (unchanged: operational routes)
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

# Lightweight JSON API example (search)
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


# ---------------------------------------------------------------------------
# Application Factory
# ---------------------------------------------------------------------------

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
            "PREFERRED_URL_SCHEME": "https",
            "CONTENT_MAX_WIDTH": 1280,  # added for centered layout
        }
    )
    if config_overrides:
        app.config.update(config_overrides)

    # Register blueprints (order matters only for overlapping routes; here it's fine)
    app.register_blueprint(public_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(bots_bp)

    # Hooks & helpers
    register_context_processors(app)
    register_error_handlers(app)
    persist_theme(app)

    return app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_mock_user() -> Dict[str, Any]:
    return {
        "name": "Mekesh",
        "email": "mekesh.engineer@gmail.com",
        "avatar_url": "https://images.unsplash.com/photo-1659482633369-9fe69af50bfb?auto=format&fit=facearea&facepad=3&w=160&h=160&q=80",
    }

def build_navigation() -> List[NavSection]:
    """
    Builds sidebar navigation for the authenticated app shell (dashboard pages).
    Landing page itself may or may not use the sidebar layout depending on your base.html logic.
    """
    endpoint = request.endpoint or ""

    # Revised navigation to include explicit Home (landing) link
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


# ---------------------------------------------------------------------------
# Context Processors & Error Handlers
# ---------------------------------------------------------------------------

def register_context_processors(app: Flask) -> None:
    @app.context_processor
    def inject_globals():
        """
        Provide nav + theme. The landing page might still receive nav_sections;
        your templates can choose to hide sidebar when on public.landing if desired.
        """
        theme = request.cookies.get("theme", "dark")
        return {
            "nav_sections": build_navigation(),
            "theme": theme,
            "content_max_width": current_app.config.get("CONTENT_MAX_WIDTH", 1280),  # added
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
        # For 404/500 show landing page styling but you could switch to a dedicated template
        return (
            render_template(
                "landing/index.html",
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


# ---------------------------------------------------------------------------
# Theme Persistence Endpoint
# ---------------------------------------------------------------------------

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
            max_age=60 * 60 * 24 * 365,  # 1 year
            httponly=False,
            samesite="Lax",
        )
        return resp


# ---------------------------------------------------------------------------
# Main Entry
# ---------------------------------------------------------------------------

def main():
    app = create_app()
    app.run(
        host=os.environ.get("FLASK_RUN_HOST", "127.0.0.1"),
        port=int(os.environ.get("FLASK_RUN_PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG", "1") == "1",
    )

if __name__ == "__main__":
    main()