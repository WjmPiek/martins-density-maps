from datetime import datetime

from flask_login import UserMixin
from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db


ADMIN_EMAIL = "wjm@martinsdirect.com"


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
        return self.role == "admin" or (self.email or "").strip().lower() == ADMIN_EMAIL


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
    place_id = db.Column(db.String(255))
    formatted_address = db.Column(db.String(500))
    geocode_status = db.Column(db.String(50))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    weight = db.Column(db.Float, default=1.0)
    next_of_kin_name = db.Column(db.String(120))
    next_of_kin_surname = db.Column(db.String(120))
    relationship = db.Column(db.String(120))
    contact_number = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (db.UniqueConstraint("user_id", "mf_file", name="uq_user_mf_file"),)

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
            "placeId": self.place_id,
            "formattedAddress": self.formatted_address,
            "geocodeStatus": self.geocode_status,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "weight": self.weight if self.weight is not None else 1,
            "nextOfKinName": self.next_of_kin_name or "",
            "nextOfKinSurname": self.next_of_kin_surname or "",
            "relationship": self.relationship or "",
            "contactNumber": self.contact_number or "",
            "owner": self.user.name if self.user else "",
            "ownerEmail": self.user.email if self.user else "",
            "ownerId": self.user.id if self.user else None,
            "updatedAt": self.updated_at.isoformat(),
        }
