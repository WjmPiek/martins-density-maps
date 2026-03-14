from flask import Blueprint, current_app, flash, redirect, render_template, request, send_file, url_for
from flask_login import current_user, login_required

from ..constants import PROVINCES
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


@admin_bp.route("/admin/user-dashboard-preview")
@login_required
@admin_required
def user_dashboard_preview():
    selected_user_id = (request.args.get("user_id") or "").strip()
    preview_user = None

    if selected_user_id.isdigit():
        preview_user = User.query.get(int(selected_user_id))
    if preview_user is None:
        preview_user = User.query.filter(User.id != current_user.id).order_by(User.name.asc(), User.email.asc()).first()

    return render_template(
        "dashboard.html",
        provinces=PROVINCES,
        google_maps_api_key=current_app.config.get("GOOGLE_MAPS_API_KEY", ""),
        preview_mode=True,
        dashboard_read_only=True,
        show_editor=True,
        show_owner_column=False,
        show_province_chart=False,
        selected_user_id=str(preview_user.id) if preview_user else "",
    )


@admin_bp.route("/admin/users/<int:user_id>/activate", methods=["POST"])
@login_required
@admin_required
def activate_user(user_id):
    user = User.query.get_or_404(user_id)
    if user.role == "inactive":
        user.role = "user"
        db.session.commit()
        flash(f"{user.name} has been activated.", "success")
    else:
        flash(f"{user.name} is already active.", "info")
    return redirect(url_for("admin.users"))


@admin_bp.route("/admin/users/<int:user_id>/deactivate", methods=["POST"])
@login_required
@admin_required
def deactivate_user(user_id):
    user = User.query.get_or_404(user_id)

    if user.id == current_user.id:
        flash("You cannot deactivate your own account.", "warning")
        return redirect(url_for("admin.users"))

    if user.role != "inactive":
        user.role = "inactive"
        db.session.commit()
        flash(f"{user.name} has been deactivated.", "success")
    else:
        flash(f"{user.name} is already deactivated.", "info")
    return redirect(url_for("admin.users"))


@admin_bp.route("/admin/users/<int:user_id>/delete", methods=["POST"])
@login_required
@admin_required
def delete_user(user_id):
    user = User.query.get_or_404(user_id)

    if user.id == current_user.id:
        flash("You cannot delete your own account.", "warning")
        return redirect(url_for("admin.users"))

    deleted_name = user.name
    db.session.delete(user)
    db.session.commit()
    flash(f"{deleted_name} has been deleted.", "success")
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
