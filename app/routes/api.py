import os
from collections import Counter
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required
from werkzeug.utils import secure_filename

from ..extensions import db
from ..models import Record, Upload
from ..services.excel import parse_upload
from ..services.export import write_records_to_disk
from ..services.records import dataset_for_user, upsert_record


api_bp = Blueprint("api", __name__)


@api_bp.route("/api/records")
@login_required
def api_records():
    selected_user_id = request.args.get("user_id", "").strip() or None
    if not current_user.is_admin:
        selected_user_id = None
    return jsonify(dataset_for_user(current_user, selected_user_id=selected_user_id))


@api_bp.route("/api/records", methods=["POST"])
@login_required
def api_save_record():
    payload = request.get_json(force=True)
    try:
        record = upsert_record(current_user.id, payload)
        db.session.commit()
        write_records_to_disk(current_user, f"{current_user.name}.xlsx")
        return jsonify({"message": "Record saved.", "record": record.to_dict()})
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("Could not save record: %s", exc)
        db.session.rollback()
        return jsonify({"error": "Could not save record."}), 500


@api_bp.route("/api/records/<int:record_id>", methods=["DELETE"])
@login_required
def api_delete_record(record_id):
    record = Record.query.get_or_404(record_id)
    if not current_user.is_admin and record.user_id != current_user.id:
        return jsonify({"error": "Not allowed."}), 403

    db.session.delete(record)
    db.session.commit()
    write_records_to_disk(current_user, f"{current_user.name}.xlsx")
    return jsonify({"message": "Record deleted."})


@api_bp.route("/api/upload", methods=["POST"])
@login_required
def api_upload():
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "Select an Excel file to upload."}), 400

    filename = secure_filename(os.path.basename(file.filename))
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
        current_app.logger.exception("Upload failed: %s", exc)
        db.session.rollback()
        return jsonify({"error": "Upload failed."}), 500


@api_bp.route("/api/analytics")
@login_required
def api_analytics():
    selected_user_id = request.args.get("user_id", "").strip() or None

    query = Record.query
    if not current_user.is_admin:
        query = query.filter_by(user_id=current_user.id)
    elif selected_user_id:
        try:
            query = query.filter_by(user_id=int(selected_user_id))
        except ValueError:
            pass

    records = query.all()

    province = Counter(r.province for r in records if r.province)
    cities = Counter(r.city for r in records if r.city)
    churches = Counter(r.church_name for r in records if getattr(r, "church_name", None))
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

    top_cities = dict(cities.most_common(10))
    top_churches = dict(churches.most_common(10))
    ordered_months = dict(sorted(months.items()))
    return jsonify({"province": dict(province), "cities": top_cities, "churches": top_churches, "months": ordered_months})
