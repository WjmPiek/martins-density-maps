from flask import Blueprint, abort, render_template, send_file
from flask_login import current_user, login_required

from ..models import Record, Upload, User
from ..services.export import build_workbook
from ..utils.decorators import admin_required

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/admin")
@login_required
@admin_required
def admin():
    user_count = User.query.count()
    record_count = Record.query.count()
    upload_count = Upload.query.count()
    latest_uploads = Upload.query.order_by(Upload.created_at.desc()).limit(10).all()

    return render_template(
        "admin.html",
        user_count=user_count,
        record_count=record_count,
        upload_count=upload_count,
        latest_uploads=latest_uploads,
    )


@admin_bp.route("/admin/users")
@login_required
def users():
    if not current_user.is_admin:
        abort(403)

    users = User.query.order_by(User.name.asc(), User.email.asc()).all()
    return render_template("admin_users.html", users=users)


@admin_bp.route("/admin/download/central.xlsx")
@login_required
@admin_required
def download_central():
    records = Record.query.join(User).order_by(User.name.asc(), Record.city.asc(), Record.mf_file.asc()).all()
    stream = build_workbook(records)
    return send_file(
        stream,
        as_attachment=True,
        download_name="martins_density_map_data.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
