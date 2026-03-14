from flask import Flask

def create_app():
    app = Flask(__name__)

    # import and register blueprints here
    from app.routes.api import api_bp
    from app.routes.main import main_bp
    from app.routes.auth import auth_bp
    from app.routes.admin import admin_bp
    from app.routes.web_upload import upload_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(upload_bp)

    return app