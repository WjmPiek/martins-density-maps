from sqlalchemy.orm import joinedload

from ..extensions import db
from ..models import Record
from ..utils.helpers import build_full_address, normalize_float, normalize_text
from .geocoding import geocode_address


def upsert_record(user_id, payload):
    mf_file = normalize_text(payload.get('mfFile'))
    if not mf_file:
        raise ValueError('MF File is required.')

    record = Record.query.filter_by(user_id=user_id, mf_file=mf_file).first()
    if record is None:
        record = Record(user_id=user_id, mf_file=mf_file)
        db.session.add(record)

    record.deceased_name = normalize_text(payload.get('deceasedName'))
    record.deceased_surname = normalize_text(payload.get('deceasedSurname'))
    record.dod = normalize_text(payload.get('dod'))
    record.deceased_address = normalize_text(payload.get('deceasedAddress')) or normalize_text(payload.get('address'))
    record.address = normalize_text(payload.get('address'))
    record.city = normalize_text(payload.get('city'))
    record.province = normalize_text(payload.get('province'))
    record.postal_code = normalize_text(payload.get('postalCode'))
    record.country = normalize_text(payload.get('country'))
    record.full_address = normalize_text(payload.get('fullAddress')) or build_full_address(
        record.address, record.city, record.province, record.country
    )
    record.latitude = normalize_float(payload.get('latitude'))
    record.longitude = normalize_float(payload.get('longitude'))
    if record.latitude is None or record.longitude is None:
        record.latitude, record.longitude = geocode_address(record.full_address)
    record.weight = normalize_float(payload.get('weight')) or 1.0
    record.church_name = normalize_text(payload.get('churchName'))
    record.church_address = normalize_text(payload.get('churchAddress'))
    record.pastor_name = normalize_text(payload.get('pastorName'))
    record.next_of_kin_name = normalize_text(payload.get('NextOfKinName') or payload.get('nextOfKinName'))
    record.next_of_kin_surname = normalize_text(payload.get('NextOfKinSurname') or payload.get('nextOfKinSurname'))
    record.relationship = normalize_text(payload.get('relationship'))
    record.contact_number = normalize_text(payload.get('contactNumber'))
    return record


def dataset_for_user(user):
    query = Record.query
    if not user.is_admin:
        query = query.filter_by(user_id=user.id)

    records = query.options(joinedload(Record.user)).order_by(Record.city.asc(), Record.mf_file.asc()).all()
    mapped = sum(1 for r in records if r.latitude is not None and r.longitude is not None)
    provinces = sorted({r.province for r in records if r.province})
    owners = sorted({r.user.name for r in records})

    return {
        'records': [r.to_dict() for r in records],
        'summary': {
            'total': len(records),
            'mapped': mapped,
            'unmapped': len(records) - mapped,
            'provinces': provinces,
            'owners': owners,
        },
    }
