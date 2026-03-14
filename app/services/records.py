from sqlalchemy.orm import joinedload

from ..extensions import db
from ..models import Record
from ..utils.helpers import build_full_address, normalize_float, normalize_text
from .geocoding import geocode_address


def upsert_record(user_id, payload):
    payload = payload or {}
    record_id = payload.get("id")
    mf_file = normalize_text(payload.get("mfFile"))
    if not mf_file:
        raise ValueError("MF File is required.")

    record = None
    if record_id:
        record = Record.query.filter_by(id=record_id, user_id=user_id).first()
    if record is None:
        record = Record.query.filter_by(user_id=user_id, mf_file=mf_file).first()
    if record is None:
        record = Record(user_id=user_id, mf_file=mf_file)
        db.session.add(record)

    record.mf_file = mf_file
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

    record.weight = normalize_float(payload.get("weight")) or 1.0
    record.next_of_kin_name = normalize_text(payload.get("NextOfKinName") or payload.get("nextOfKinName"))
    record.next_of_kin_surname = normalize_text(payload.get("NextOfKinSurname") or payload.get("nextOfKinSurname"))
    record.relationship = normalize_text(payload.get("relationship"))
    record.contact_number = normalize_text(payload.get("contactNumber"))

    incoming_lat = normalize_float(payload.get("latitude"))
    incoming_lng = normalize_float(payload.get("longitude"))
    incoming_place_id = normalize_text(payload.get("placeId"))
    incoming_formatted_address = normalize_text(payload.get("formattedAddress"))
    incoming_geocode_status = normalize_text(payload.get("geocodeStatus"))

    if incoming_lat is not None and incoming_lng is not None:
        record.latitude = incoming_lat
        record.longitude = incoming_lng
        record.place_id = incoming_place_id
        record.formatted_address = incoming_formatted_address or record.full_address
        record.geocode_status = incoming_geocode_status or "OK"
    else:
        geo = geocode_address(record.full_address)
        record.place_id = geo.get("place_id", "")
        record.formatted_address = geo.get("formatted_address", record.full_address)
        record.latitude = normalize_float(geo.get("latitude"))
        record.longitude = normalize_float(geo.get("longitude"))
        record.geocode_status = geo.get("geocode_status", "UNKNOWN")

    return record


def dataset_for_user(user, branch=None):
    query = Record.query.options(joinedload(Record.user))

    if not user.is_admin:
        query = query.filter(Record.user_id == user.id)
    elif branch:
        query = query.filter(Record.user_id == branch)

    records = query.order_by(Record.city.asc(), Record.mf_file.asc()).all()
    mapped = sum(1 for r in records if r.latitude is not None and r.longitude is not None)
    provinces = sorted({r.province for r in records if r.province})
    owners = []
    seen = set()
    for record in records:
        if not record.user:
            continue
        if record.user_id in seen:
            continue
        seen.add(record.user_id)
        owners.append({
            "id": record.user_id,
            "name": record.user.name,
            "email": record.user.email,
        })

    owners.sort(key=lambda item: ((item.get("name") or "").lower(), (item.get("email") or "").lower()))

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
