import os
from datetime import datetime
from functools import wraps
from io import BytesIO

import pandas as pd
from flask import (
    Flask,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    url_for,
)
from flask_login import (
    LoginManager,
    UserMixin,
    current_user,
    login_required,
    login_user,
    logout_user,
)
from flask_sqlalchemy import SQLAlchemy
from geopy.geocoders import Nominatim
from openpyxl import Workbook, load_workbook
from sqlalchemy import func
from sqlalchemy.orm import joinedload
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename


app = Flask(__name__)

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
BRANCH_DIR = os.path.join(UPLOAD_DIR, "branches")
EXPORT_DIR = os.path.join(UPLOAD_DIR, "exports")
INSTANCE_DIR = os.path.join(BASE_DIR, "instance")
LOGO_PATH = os.path.join(BASE_DIR, "static", "img", "martins-logo.png")
TEMPLATE_EXPORT = os.path.join(BASE_DIR, "martins_density_map_data.xlsx")
TEMPLATE_DOWNLOAD_PATH = os.path.join(
    BASE_DIR, "static", "templates", "martins_density_map_template.xlsx"
)

UPLOAD_COLUMNS = [
    "MF File",
    "Deceased Name",
    "Deceased Surname",
    "DOD",
    "Address",
    "City",
    "Province",
    "Country",
    "Next of Kin Name",
    "Next of Kin Surname",
    "Relationship",
    "Contact Number",
]

EXPORT_COLUMNS = [
    "MF File",
    "Deceased Name",
    "Deceased Surname",
    "DOD",
    "Address",
    "City",
    "Province",
    "Country",
    "Full Address",
    "Latitude",
    "Longitude",
    "Weight",
    "Next of Kin Name",
    "Next of Kin Surname",
    "Relationship",
    "Contact Number",
]

OPTIONAL_UPLOAD_COLUMNS = ["Full Address", "Latitude", "Longitude", "Weight"]

PROVINCES = [
    "Eastern Cape",
    "Free State",
    "Gauteng",
    "KwaZulu-Natal",
    "Limpopo",
    "Mpumalanga",
    "North West",
    "Northern Cape",
    "Western Cape",
]

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(BRANCH_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)
os.makedirs(INSTANCE_DIR, exist_ok=True)

app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "change-me-in-render")
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL", f"sqlite:///{os.path.join(INSTANCE_DIR, 'app.db')}"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

if app.config["SQLALCHEMY_DATABASE_URI"].startswith("postgres://"):
    app.config["SQLALCHEMY_DATABASE_URI"] = app.config["SQLALCHEMY_DATABASE_URI"].replace(
        "postgres://", "postgresql://", 1
    )

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"
login_manager.login_message_category = "warning"


class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="user")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    uploads = db.relationship("Upload", backref="user", lazy=True, cascade="all, delete-orphan")
    records = db.relationship("Record", backref="user", lazy=True, cascade="all, delete-orphan")

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


class Upload(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    filename = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    imported_rows = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.String(30), nullable=False, default="completed")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class Record(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    mf_file = db.Column(db.String(120), nullable=False, index=True)
    deceased_name = db.Column(db.String(120))
    deceased_surname = db.Column(db.String(120))
    dod = db.Column(db.String(50))
    address = db.Column(db.String(255))
    city = db.Column(db.String(120), index=True)
    province = db.Column(db.String(120), index=True)
    country = db.Column(db.String(120))
    full_address = db.Column(db.String(512))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    weight = db.Column(db.Float, default=1.0)
    next_of_kin_name = db.Column(db.String(120))
    next_of_kin_surname = db.Column(db.String(120))
    relationship = db.Column(db.String(120))
    contact_number = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint("user_id", "mf_file", name="uq_user_mf_file"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "mfFile": self.mf_file,
            "deceasedName": self.deceased_name or "",
            "deceasedSurname": self.deceased_surname or "",
            "dod": self.dod or "",
            "address": self.address or "",
            "city": self.city or "",
            "province": self.province or "",
            "country": self.country or "",
            "fullAddress": self.full_address or "",
            "latitude": self.latitude,
            "longitude": self.longitude,
            "weight": self.weight if self.weight is not None else 1,
            "nextOfKinName": self.next_of_kin_name or "",
            "nextOfKinSurname": self.next_of_kin_surname or "",
            "relationship": self.relationship or "",
            "contactNumber": self.contact_number or "",
            "owner": self.user.name,
            "ownerEmail": self.user.email,
            "updatedAt": self.updated_at.isoformat(),
        }


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


def admin_required(view_func):
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            flash("Admin access required.", "danger")
            return redirect(url_for("dashboard"))
        return view_func(*args, **kwargs)

    return wrapped


def bootstrap_admin() -> None:
    admin_email = os.environ.get("ADMIN_EMAIL")
    admin_password = os.environ.get("ADMIN_PASSWORD")
    admin_name = os.environ.get("ADMIN_NAME", "Martins Admin")

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


def normalize_text(value):
    if value is None:
        return ""
    return str(value).strip()


def normalize_float(value):
    text = normalize_text(value)
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def build_full_address(address, city, province, country):
    return ", ".join([part for part in [address, city, province, country] if normalize_text(part)])


def branch_storage_name(filename, fallback_name="branch"):
    safe_name = secure_filename(filename or "")
    if not safe_name:
        safe_name = f"{fallback_name}.xlsx"
    root, ext = os.path.splitext(safe_name)
    if ext.lower() not in {".xlsx", ".xlsm"}:
        ext = ".xlsx"
    return f"{root}{ext}"


def branch_file_path(filename):
    return os.path.join(BRANCH_DIR, branch_storage_name(filename))


def geocode_address(full_address):
    if not full_address:
        return None, None

    geolocator = Nominatim(user_agent="martins_density_map")
    try:
        location = geolocator.geocode(full_address, timeout=10)
        if location:
            return location.latitude, location.longitude
    except Exception:
        pass
    return None, None


def parse_upload(file_storage):
    wb = load_workbook(file_storage, data_only=True)
    ws = wb[wb.sheetnames[0]]
    header_row = [normalize_text(cell) for cell in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]

    missing_required = [col for col in UPLOAD_COLUMNS if col not in header_row]
    if missing_required:
        raise ValueError("Workbook is missing required columns: " + ", ".join(missing_required))

    usable_columns = [col for col in header_row if col in set(UPLOAD_COLUMNS + OPTIONAL_UPLOAD_COLUMNS)]

    records = []
    warnings = []
    seen_mf = set()

    for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        data = dict(zip(header_row, row[: len(header_row)]))
        filtered_values = [data.get(col) for col in usable_columns]
        mf_file = normalize_text(data.get("MF File"))

        if not any(normalize_text(v) for v in filtered_values):
            continue

        if not mf_file:
            warnings.append(f"Row {idx}: missing MF File and skipped.")
            continue

        if mf_file in seen_mf:
            warnings.append(f"Row {idx}: duplicate MF File '{mf_file}' in upload; keeping latest row.")
        seen_mf.add(mf_file)

        address = normalize_text(data.get("Address"))
        city = normalize_text(data.get("City"))
        province = normalize_text(data.get("Province"))
        country = normalize_text(data.get("Country")) or "South Africa"
        full_address = normalize_text(data.get("Full Address")) or build_full_address(address, city, province, country)
        latitude = normalize_float(data.get("Latitude"))
        longitude = normalize_float(data.get("Longitude"))
        weight = normalize_float(data.get("Weight")) or 1.0

        if latitude is None or longitude is None:
            latitude, longitude = geocode_address(full_address)

        row_payload = {
            "mf_file": mf_file,
            "deceased_name": normalize_text(data.get("Deceased Name")),
            "deceased_surname": normalize_text(data.get("Deceased Surname")),
            "dod": normalize_text(data.get("DOD")),
            "address": address,
            "city": city,
            "province": province,
            "country": country,
            "full_address": full_address,
            "latitude": latitude,
            "longitude": longitude,
            "weight": weight,
            "next_of_kin_name": normalize_text(data.get("Next of Kin Name")),
            "next_of_kin_surname": normalize_text(data.get("Next of Kin Surname")),
            "relationship": normalize_text(data.get("Relationship")),
            "contact_number": normalize_text(data.get("Contact Number")),
        }

        records = [r for r in records if r["mf_file"] != mf_file]
        records.append(row_payload)

    return records, warnings


def upsert_record(user_id, payload):
    mf_file = normalize_text(payload.get("mfFile"))
    if not mf_file:
        raise ValueError("MF File is required.")

    record = Record.query.filter_by(user_id=user_id, mf_file=mf_file).first()
    if record is None:
        record = Record(user_id=user_id, mf_file=mf_file)
        db.session.add(record)

    record.deceased_name = normalize_text(payload.get("deceasedName"))
    record.deceased_surname = normalize_text(payload.get("deceasedSurname"))
    record.dod = normalize_text(payload.get("dod"))
    record.address = normalize_text(payload.get("address"))
    record.city = normalize_text(payload.get("city"))
    record.province = normalize_text(payload.get("province"))
    record.country = normalize_text(payload.get("country")) or "South Africa"
    record.full_address = normalize_text(payload.get("fullAddress")) or build_full_address(
        record.address, record.city, record.province, record.country
    )
    record.latitude = normalize_float(payload.get("latitude"))
    record.longitude = normalize_float(payload.get("longitude"))
    if record.latitude is None or record.longitude is None:
        record.latitude, record.longitude = geocode_address(record.full_address)
    record.weight = normalize_float(payload.get("weight")) or 1.0
    record.next_of_kin_name = normalize_text(payload.get("NextOfKinName") or payload.get("nextOfKinName"))
    record.next_of_kin_surname = normalize_text(payload.get("NextOfKinSurname") or payload.get("nextOfKinSurname"))
    record.relationship = normalize_text(payload.get("relationship"))
    record.contact_number = normalize_text(payload.get("contactNumber"))
    return record


def sync_excel_exports_for_user(user, branch_filename=None):
    user_records = (
        Record.query.filter_by(user_id=user.id)
        .order_by(Record.city.asc(), Record.mf_file.asc())
        .all()
    )
    branch_filename = branch_filename or f"{user.name}.xlsx"
    branch_stream = build_workbook(user_records)
    with open(branch_file_path(branch_filename), "wb") as handle:
        handle.write(branch_stream.getvalue())

    all_records = (
        Record.query.options(joinedload(Record.user))
        .join(User)
        .order_by(User.name.asc(), Record.city.asc(), Record.mf_file.asc())
        .all()
    )
    central_stream = build_workbook(all_records)
    with open(os.path.join(EXPORT_DIR, "central.xlsx"), "wb") as handle:
        handle.write(central_stream.getvalue())


def build_workbook(records):
    wb = Workbook()
    ws = wb.active
    ws.title = "Data"
    ws.append(EXPORT_COLUMNS)

    for record in records:
        ws.append(
            [
                record.mf_file,
                record.deceased_name,
                record.deceased_surname,
                record.dod,
                record.address,
                record.city,
                record.province,
                record.country,
                record.full_address,
                record.latitude,
                record.longitude,
                record.weight,
                record.next_of_kin_name,
                record.next_of_kin_surname,
                record.relationship,
                record.contact_number,
            ]
        )

    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        ws.column_dimensions[col[0].column_letter].width = min(max(max_len + 2, 12), 28)

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return stream


def dataset_for_user(user):
    query = Record.query.options(joinedload(Record.user))
    if not user.is_admin:
        query = query.filter_by(user_id=user.id)

    records = query.order_by(Record.city.asc(), Record.mf_file.asc()).all()
    mapped = sum(1 for r in records if r.latitude is not None and r.longitude is not None)
    provinces = sorted({r.province for r in records if r.province})
    owners = sorted({r.user.name for r in records})

    return {
        "records": [r.to_dict() for r in records],
        "summary": {
            "total": len(records),
            "mapped": mapped,
            "unmapped": len(records) - mapped,
            "provinces": provinces,
            "owners": owners,
        },
    }

@app.route("/upload-page")
@login_required
def upload_page():
    return render_template("upload.html")

@app.route("/download-template")
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


@app.route("/")
def index():
    if current_user.is_authenticated:
        return redirect(url_for("dashboard"))
    return redirect(url_for("login"))


@app.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        name = normalize_text(request.form.get("name"))
        email = normalize_text(request.form.get("email")).lower()
        password = request.form.get("password", "")
        confirm = request.form.get("confirm_password", "")

        if not name or not email or not password:
            flash("Name, email, and password are required.", "danger")
        elif password != confirm:
            flash("Passwords do not match.", "danger")
        elif User.query.filter(func.lower(User.email) == email).first():
            flash("An account with that email already exists.", "warning")
        else:
            user = User(name=name, email=email, role="user")
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
            login_user(user)
            flash("Welcome to Martins Density Map.", "success")
            return redirect(url_for("dashboard"))

    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        email = normalize_text(request.form.get("email")).lower()
        password = request.form.get("password", "")
        user = User.query.filter(func.lower(User.email) == email).first()

        if user and user.check_password(password):
            login_user(user, remember=True)
            flash("Signed in successfully.", "success")
            next_url = request.args.get("next")
            return redirect(next_url or url_for("dashboard"))

        flash("Invalid email or password.", "danger")

    return render_template("login.html")


@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("login"))


@app.route("/dashboard")
@login_required
def dashboard():
    return render_template(
        "dashboard.html",
        provinces=PROVINCES,
        google_maps_api_key=os.environ.get("GOOGLE_MAPS_API_KEY", ""),
    )


@app.route("/admin")
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


@app.route("/api/records")
@login_required
def api_records():
    return jsonify(dataset_for_user(current_user))


@app.route("/api/records", methods=["POST"])
@login_required
def api_save_record():
    payload = request.get_json(force=True)

    try:
        record = upsert_record(current_user.id, payload)
        db.session.commit()
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not save record."}), 500

    return jsonify({"message": "Record saved.", "record": record.to_dict()})


@app.route("/api/records/<int:record_id>", methods=["DELETE"])
@login_required
def api_delete_record(record_id):
    record = Record.query.get_or_404(record_id)

    if not current_user.is_admin and record.user_id != current_user.id:
        return jsonify({"error": "Not allowed."}), 403

    db.session.delete(record)
    db.session.commit()
    return jsonify({"message": "Record deleted."})


@app.route("/api/upload", methods=["POST"])
@login_required
def api_upload():
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "Select an Excel file to upload."}), 400

    filename = secure_filename(file.filename)

    try:
        imported_rows, warnings = parse_upload(file)

        Record.query.filter_by(user_id=current_user.id).delete()

        for row in imported_rows:
            db.session.add(Record(user_id=current_user.id, **row))

        stored_name = f"{current_user.id}_{int(datetime.utcnow().timestamp())}_{filename}"
        branch_name = branch_storage_name(filename, fallback_name=current_user.name or "branch")
        file.stream.seek(0)
        file.save(os.path.join(UPLOAD_DIR, stored_name))

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
        sync_excel_exports_for_user(current_user, branch_name)

        return jsonify(
            {
                "message": f"Imported {len(imported_rows)} records.",
                "warnings": warnings,
            }
        )
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Upload failed."}), 500


@app.route("/upload", methods=["POST"])
@login_required
def upload_excel():
    file = request.files.get("file")
    if not file or not file.filename:
        flash("Please choose a file.", "warning")
        return redirect(url_for("dashboard"))

    original_filename = file.filename
    filename = original_filename.lower()

    try:
        imported_rows, warnings = parse_upload(file)
    except ValueError as exc:
        flash(str(exc), "danger")
        return redirect(url_for("upload_page"))
    except Exception:
        flash("Could not read the uploaded file. Please use the Martins template.", "danger")
        return redirect(url_for("upload_page"))

    try:
        Record.query.filter_by(user_id=current_user.id).delete()

        for row in imported_rows:
            db.session.add(Record(user_id=current_user.id, **row))

        stored_name = f"{current_user.id}_{int(datetime.utcnow().timestamp())}_{secure_filename(original_filename)}"
        branch_name = branch_storage_name(original_filename, fallback_name=current_user.name or "branch")

        file.stream.seek(0)
        file.save(os.path.join(UPLOAD_DIR, stored_name))

        db.session.add(
            Upload(
                user_id=current_user.id,
                filename=stored_name,
                original_filename=original_filename,
                imported_rows=len(imported_rows),
                status="completed",
            )
        )

        db.session.commit()
        sync_excel_exports_for_user(current_user, branch_name)

        success_message = f"File uploaded successfully. Imported {len(imported_rows)} records."
        if warnings:
            success_message += " " + " ".join(warnings[:5])
        flash(success_message, "success")
    except Exception as exc:
        db.session.rollback()
        flash(f"Upload failed. Please verify the template columns and data types. {exc}", "danger")

    return redirect(url_for("dashboard"))


@app.route("/download/my-data.xlsx")
@login_required
def download_my_data():
    records = (
        Record.query.filter_by(user_id=current_user.id)
        .order_by(Record.city.asc(), Record.mf_file.asc())
        .all()
    )
    stream = build_workbook(records)

    return send_file(
        stream,
        as_attachment=True,
        download_name=f"{secure_filename(current_user.name) or 'my_data'}.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.route("/admin/download/central.xlsx")
@login_required
@admin_required
def download_central():
    records = (
        Record.query.join(User)
        .order_by(User.name.asc(), Record.city.asc(), Record.mf_file.asc())
        .all()
    )
    stream = build_workbook(records)

    return send_file(
        stream,
        as_attachment=True,
        download_name="central.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.context_processor
def inject_globals():
    return {
        "google_maps_api_key": os.environ.get("GOOGLE_MAPS_API_KEY", ""),
        "logo_path": url_for("static", filename="img/martins-logo.png"),
    }


with app.app_context():
    db.create_all()
    bootstrap_admin()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))