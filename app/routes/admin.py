from flask import Blueprint, flash, redirect, render_template, request, send_file, url_for
from flask_login import current_user, login_required

from ..extensions import db
from ..models import Record, Upload, User
from ..services.export import build_workbook
from ..utils.decorators import admin_required

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/admin")
@login_required
@admin_required
def admin():
    user_count = User.query.count()
    active_user_count = User.query.filter(User.role != "inactive").count()
    record_count = Record.query.count()
    upload_count = Upload.query.count()
    latest_uploads = Upload.query.order_by(Upload.created_at.desc()).limit(10).all()

    return render_template(
        "admin.html",
        user_count=user_count,
        active_user_count=active_user_count,
        record_count=record_count,
        upload_count=upload_count,
        latest_uploads=latest_uploads,
    )


@admin_bp.route("/admin/users")
@login_required
@admin_required
def users():
    users = User.query.order_by(User.created_at.desc(), User.name.asc()).all()
    return render_template("admin_users.html", users=users)


@admin_bp.route("/admin/users/<int:user_id>/toggle-active", methods=["POST"])
@login_required
@admin_required
def toggle_user_active(user_id):
    user = User.query.get_or_404(user_id)

    if user.id == current_user.id:
        flash("You cannot deactivate your own account.", "warning")
        return redirect(url_for("admin.users"))

    user.role = "user" if user.role == "inactive" else "inactive"
    db.session.commit()

    flash(
        f"{user.name} has been {'reactivated' if user.role == 'user' else 'deactivated'}.",
        "success",
    )
    return redirect(url_for("admin.users"))


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
