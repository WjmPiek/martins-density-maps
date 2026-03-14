from sqlalchemy import func

from .extensions import db
from .models import User


def bootstrap_admin(app):
    admin_email = app.config.get("ADMIN_EMAIL")
    admin_password = app.config.get("ADMIN_PASSWORD")
    admin_name = app.config.get("ADMIN_NAME", "Martins Admin")

    if not admin_email or not admin_password:
        return

    existing = User.query.filter(func.lower(User.email) == admin_email.lower()).first()
    if existing:
        if existing.role != "admin":
            existing.role = "admin"
            db.session.commit()
        return

    user = User(name=admin_name, email=admin_email.lower(), role="admin")
    user.set_password(admin_password)
    db.session.add(user)
    db.session.commit()
