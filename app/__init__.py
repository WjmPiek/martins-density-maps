from flask import Flask
from .extensions import db, login_manager

def create_app():
    app = Flask(__name__)

    app.config.from_object("config.Config")
    app.config["SECRET_KEY"] = "your-secret-key"
    app.config["SQLALCHEMY_DATABASE_URI"] = "your-db-uri"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = "auth.login"

    from app.routes.main import main_bp
    from app.routes.auth import auth_bp
    from app.routes.admin import admin_bp
    from app.routes.api import api_bp
    from app.routes.web_upload import upload_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(upload_bp)

    return app