from flask import Blueprint, current_app, flash, redirect, render_template, request, send_file, url_for
from flask_login import login_required
from sqlalchemy.orm import joinedload

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
    active_user_count = User.query.filter_by(is_active=True).count()
    record_count = Record.query.count()
    upload_count = Upload.query.count()
    latest_uploads = (
        Upload.query.options(joinedload(Upload.user))
        .order_by(Upload.created_at.desc())
        .limit(10)
        .all()
    )

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
    users = User.query.order_by(User.name.asc(), User.email.asc()).all()
    return render_template("admin_users.html", users=users)


@admin_bp.route("/admin/users/<int:user_id>/activate", methods=["POST"])
@login_required
@admin_required
def activate_user(user_id):
    user = User.query.get_or_404(user_id)
    user.is_active = True
    db.session.commit()
    flash(f"{user.name} has been activated.", "success")
    return redirect(url_for("admin.users"))


@admin_bp.route("/admin/users/<int:user_id>/deactivate", methods=["POST"])
@login_required
@admin_required
def deactivate_user(user_id):
    user = User.query.get_or_404(user_id)
    if user.is_admin:
        flash("Admin users cannot be deactivated from this screen.", "warning")
        return redirect(url_for("admin.users"))
    user.is_active = False
    db.session.commit()
    flash(f"{user.name} has been deactivated.", "success")
    return redirect(url_for("admin.users"))


@admin_bp.route("/admin/users/<int:user_id>/delete", methods=["POST"])
@login_required
@admin_required
def delete_user(user_id):
    user = User.query.get_or_404(user_id)
    if user.is_admin:
        flash("Admin users cannot be deleted from this screen.", "warning")
        return redirect(url_for("admin.users"))
    db.session.delete(user)
    db.session.commit()
    flash("User deleted successfully.", "success")
    return redirect(url_for("admin.users"))


@admin_bp.route("/admin/preview")
@login_required
@admin_required
def user_dashboard_preview():
    selected_user_id = request.args.get("user_id", type=int)
    valid_selection = None
    if selected_user_id and User.query.filter_by(id=selected_user_id, is_active=True).first():
        valid_selection = selected_user_id

    return render_template(
        "dashboard.html",
        provinces=PROVINCES,
        google_maps_api_key=current_app.config.get("GOOGLE_MAPS_API_KEY", ""),
        preview_mode=True,
        dashboard_read_only=True,
        show_editor=False,
        show_owner_column=False,
        selected_user_id=valid_selection,
    )


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
