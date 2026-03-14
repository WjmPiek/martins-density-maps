import os
from datetime import datetime

from flask import Blueprint, current_app, flash, redirect, request, url_for
from flask_login import current_user, login_required
from werkzeug.utils import secure_filename

from ..extensions import db
from ..models import Record, Upload
from ..services.excel import parse_upload
from ..services.export import write_records_to_disk

web_upload_bp = Blueprint("web_upload", __name__)


@web_upload_bp.route("/upload", methods=["POST"])
@login_required
def upload_excel():
    file = request.files.get("file")
    if not file or not file.filename:
        flash("Please choose a file.", "warning")
        return redirect(url_for("main.dashboard"))

    original_filename = file.filename

    try:
        imported_rows, warnings = parse_upload(file)
        Record.query.filter_by(user_id=current_user.id).delete()

        for row in imported_rows:
            db.session.add(Record(user_id=current_user.id, **row))

        stored_name = f"{current_user.id}_{int(datetime.utcnow().timestamp())}_{secure_filename(original_filename)}"
        file.stream.seek(0)
        file.save(os.path.join(current_app.config["UPLOAD_DIR"], stored_name))

        db.session.add(
            Upload(
                user_id=current_user.id,
                filename=stored_name,
                original_filename=secure_filename(original_filename),
                imported_rows=len(imported_rows),
                status="completed",
            )
        )

        db.session.commit()
        write_records_to_disk(current_user, original_filename)

        success = f"File uploaded successfully. Imported {len(imported_rows)} records."
        if warnings:
            success += " " + " ".join(warnings[:5])
        flash(success, "success")
    except ValueError as exc:
        db.session.rollback()
        flash(str(exc), "danger")
    except Exception as exc:
        db.session.rollback()
        flash(f"Upload failed: {exc}", "danger")

    return redirect(url_for("main.dashboard"))
