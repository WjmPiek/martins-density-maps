from pathlib import Path

from flask import Flask, url_for
from .bootstrap import bootstrap_admin
from .config import Config
from .extensions import db, login_manager
from .schema import ensure_schema

BASE_DIR = Path(__file__).resolve().parent


def create_app():
    app = Flask(
        __name__,
        template_folder=str(BASE_DIR / "templates"),
        static_folder=str(BASE_DIR / "static"),
    )

    app.config.from_object(Config)
    app.config["SQLALCHEMY_DATABASE_URI"] = Config.normalize_database_uri()

    db.init_app(app)
    login_manager.init_app(app)

    from . import models  # noqa: F401
    from .routes.admin import admin_bp
    from .routes.api import api_bp
    from .routes.auth import auth_bp
    from .routes.main import main_bp
    from .routes.web_upload import web_upload_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(web_upload_bp)

    @app.context_processor
    def inject_globals():
        return {
            "google_maps_api_key": app.config.get("GOOGLE_MAPS_API_KEY", ""),
            "logo_path": url_for("static", filename="img/martins-logo.png"),
        }

    with app.app_context():
        db.create_all()
        ensure_schema()
        bootstrap_admin(app)

    return app