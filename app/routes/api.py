import os
from collections import Counter
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required
from sqlalchemy.orm import joinedload

from ..extensions import db
from ..models import Record, Upload, User
from ..services.excel import parse_upload
from ..services.export import write_records_to_disk
from ..services.records import dataset_for_request, upsert_record

api_bp = Blueprint("api", __name__)


def _selected_user_id():
    requested_user_id = request.args.get("user_id", type=int)
    if current_user.is_admin and requested_user_id:
        user = User.query.filter_by(id=requested_user_id, is_active=True).first()
        return user.id if user else None
    if not current_user.is_admin:
        return current_user.id
    return None


@api_bp.route("/api/records")
@login_required
def api_records():
    return jsonify(dataset_for_request(current_user, selected_user_id=_selected_user_id()))


@api_bp.route("/api/records", methods=["POST"])
@login_required
def api_save_record():
    if current_user.is_admin:
        return jsonify({"error": "Admin dashboards are read-only."}), 403

    payload = request.get_json(force=True)
    try:
        record = upsert_record(current_user.id, payload)
        db.session.commit()
        write_records_to_disk(current_user, f"{current_user.name}.xlsx")
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        db.session.rollback()
        current_app.logger.exception("Could not save record: %s", exc)
        return jsonify({"error": "Could not save record."}), 500
    return jsonify({"message": "Record saved.", "record": record.to_dict()})


@api_bp.route("/api/records/<int:record_id>", methods=["DELETE"])
@login_required
def api_delete_record(record_id):
    if current_user.is_admin:
        return jsonify({"error": "Admin dashboards are read-only."}), 403

    record = Record.query.get_or_404(record_id)
    if record.user_id != current_user.id:
        return jsonify({"error": "Not allowed."}), 403
    db.session.delete(record)
    db.session.commit()
    write_records_to_disk(current_user, f"{current_user.name}.xlsx")
    return jsonify({"message": "Record deleted."})


@api_bp.route("/api/upload", methods=["POST"])
@login_required
def api_upload():
    if current_user.is_admin:
        return jsonify({"error": "Admin dashboards are read-only."}), 403

    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "Select an Excel file to upload."}), 400

    filename = os.path.basename(file.filename)
    try:
        imported_rows, warnings = parse_upload(file)
        Record.query.filter_by(user_id=current_user.id).delete()
        for row in imported_rows:
            db.session.add(Record(user_id=current_user.id, **row))

        stored_name = f"{current_user.id}_{int(datetime.utcnow().timestamp())}_{filename}"
        upload_path = os.path.join(current_app.config["UPLOAD_DIR"], stored_name)
        file.stream.seek(0)
        file.save(upload_path)

        db.session.add(
            Upload(
                user_id=current_user.id,
                filename=stored_name,
                original_filename=filename,
                imported_rows=len(imported_rows),
                status="completed",
            )
        )
        db.session.commit()
        write_records_to_disk(current_user, filename)
        return jsonify({"message": f"Imported {len(imported_rows)} records.", "warnings": warnings})
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        db.session.rollback()
        current_app.logger.exception("Upload failed: %s", exc)
        return jsonify({"error": "Upload failed."}), 500


@api_bp.route("/api/analytics")
@login_required
def api_analytics():
    query = Record.query.options(joinedload(Record.user))
    selected_user_id = _selected_user_id()
    if selected_user_id:
        query = query.filter_by(user_id=selected_user_id)

    records = query.all()
    province = Counter(r.province for r in records if r.province)
    cities = Counter(r.city for r in records if r.city)
    churches = Counter(r.church_name for r in records if r.church_name)
    months = Counter()
    for r in records:
        value = (r.dod or "").strip()
        if not value:
            continue
        parsed = None
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
            try:
                parsed = datetime.strptime(value, fmt)
                break
            except ValueError:
                continue
        if parsed:
            months[parsed.strftime("%Y-%m")] += 1

    return jsonify(
        {
            "province": dict(province),
            "cities": dict(cities.most_common(10)),
            "churches": dict(churches.most_common(10)),
            "months": dict(sorted(months.items())),
        }
    )
