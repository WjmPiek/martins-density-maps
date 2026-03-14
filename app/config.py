import os


class Config:
    BASE_DIR = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
    INSTANCE_DIR = os.path.join(BASE_DIR, "instance")
    UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
    DATA_DIR = os.path.join(BASE_DIR, "data")
    LOGO_PATH = os.path.join(BASE_DIR, "static", "img", "martins-logo.png")
    TEMPLATE_DOWNLOAD_PATH = os.path.join(
        BASE_DIR, "static", "templates", "martins_density_map_template.xlsx"
    )
    CENTRAL_XLSX_PATH = os.path.join(DATA_DIR, "central.xlsx")

    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-render")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", f"sqlite:///{os.path.join(INSTANCE_DIR, 'app.db')}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024
    GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

    ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
    ADMIN_NAME = os.environ.get("ADMIN_NAME", "Martins Admin")

    @classmethod
    def normalize_database_uri(cls):
        uri = cls.SQLALCHEMY_DATABASE_URI
        if uri.startswith("postgres://"):
            return uri.replace("postgres://", "postgresql://", 1)
        return uri
