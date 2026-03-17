from io import BytesIO

from flask import Blueprint, current_app, redirect, render_template, request, send_file, url_for
from flask_login import current_user, login_required
from openpyxl import Workbook

from ..constants import PROVINCES, UPLOAD_COLUMNS
from ..models import Record
from ..services.export import build_workbook

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def index():
    if current_user.is_authenticated:
        return redirect(url_for("main.dashboard"))
    return redirect(url_for("auth.login"))


@main_bp.route("/dashboard")
@login_required
def dashboard():
    selected_user_id = request.args.get("user_id") if current_user.is_admin else None
    return render_template(
        "dashboard.html",
        provinces=PROVINCES,
        google_maps_api_key=current_app.config.get("GOOGLE_MAPS_API_KEY", ""),
        preview_mode=False,
        dashboard_read_only=False,
        show_owner_column=bool(getattr(current_user, "is_admin", False)),
        show_editor=True,
        selected_user_id=selected_user_id,
    )


@main_bp.route("/charts")
@login_required
def charts():
    selected_user_id = request.args.get("user_id") if current_user.is_admin else None
    return render_template(
        "charts.html",
        provinces=PROVINCES,
        google_maps_api_key=current_app.config.get("GOOGLE_MAPS_API_KEY", ""),
        preview_mode=False,
        dashboard_read_only=False,
        show_owner_column=bool(getattr(current_user, "is_admin", False)),
        show_editor=False,
        selected_user_id=selected_user_id,
    )


@main_bp.route("/upload-page")
@login_required
def upload_page():
    return render_template("upload.html")


@main_bp.route("/download-template")
@login_required
def download_template():
    wb = Workbook()
    ws = wb.active
    ws.title = "Template"
    ws.append(UPLOAD_COLUMNS)
    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return send_file(
        stream,
        as_attachment=True,
        download_name="martins_density_map_template.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@main_bp.route("/download/my-data.xlsx")
@login_required
def download_my_data():
    records = Record.query.filter_by(user_id=current_user.id).order_by(Record.city.asc(), Record.mf_file.asc()).all()
    stream = build_workbook(records)
    return send_file(
        stream,
        as_attachment=True,
        download_name="my_martins_density_map_data.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@main_bp.route("/download/user/<int:user_id>.xlsx")
@login_required
def download_user_data(user_id):
    if not current_user.is_admin and user_id != current_user.id:
        return redirect(url_for("main.dashboard"))
    records = Record.query.filter_by(user_id=user_id).order_by(Record.city.asc(), Record.mf_file.asc()).all()
    stream = build_workbook(records)
    download_name = f"user_{user_id}_martins_density_map_data.xlsx"
    return send_file(
        stream,
        as_attachment=True,
        download_name=download_name,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
