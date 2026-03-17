from openpyxl import load_workbook

from ..constants import EXPORT_COLUMNS, UPLOAD_COLUMNS
from ..utils.helpers import build_full_address, normalize_float, normalize_text
from .geocoding import geocode_address


def parse_upload(file_storage):
    file_storage.stream.seek(0)
    wb = load_workbook(file_storage.stream, data_only=True)
    ws = wb[wb.sheetnames[0]]
    header_row = [normalize_text(cell) for cell in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]

    has_basic = header_row[: len(UPLOAD_COLUMNS)] == UPLOAD_COLUMNS
    has_full = header_row[: len(EXPORT_COLUMNS)] == EXPORT_COLUMNS

    if not has_basic and not has_full:
        raise ValueError('Workbook columns do not match the required Martins template.')

    active_columns = EXPORT_COLUMNS if has_full else UPLOAD_COLUMNS
    records = []
    warnings = []
    seen_mf = set()

    for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        data = dict(zip(active_columns, row[: len(active_columns)]))
        mf_file = normalize_text(data.get('MF File'))

        if not any(normalize_text(v) for v in data.values()):
            continue
        if not mf_file:
            warnings.append(f'Row {idx}: missing MF File and skipped.')
            continue
        if mf_file in seen_mf:
            warnings.append(f"Row {idx}: duplicate MF File '{mf_file}' skipped.")
            continue
        seen_mf.add(mf_file)

        deceased_address = normalize_text(data.get('Deceased Address'))
        address = normalize_text(data.get('Address'))
        city = normalize_text(data.get('City'))
        province = normalize_text(data.get('Province'))
        postal_code = normalize_text(data.get('Postal Code'))
        country = normalize_text(data.get('Country'))
        full_address = normalize_text(data.get('Full Address')) or build_full_address(address, city, province, country)
        latitude = normalize_float(data.get('Latitude'))
        longitude = normalize_float(data.get('Longitude'))
        if latitude is None or longitude is None:
            latitude, longitude = geocode_address(full_address)

        records.append(
            {
                'mf_file': mf_file,
                'deceased_name': normalize_text(data.get('Deceased Name')),
                'deceased_surname': normalize_text(data.get('Deceased Surname')),
                'dod': normalize_text(data.get('DOD')),
                'deceased_address': deceased_address or address,
                'address': address,
                'city': city,
                'province': province,
                'postal_code': postal_code,
                'country': country,
                'full_address': full_address,
                'latitude': latitude,
                'longitude': longitude,
                'weight': normalize_float(data.get('Weight')) or 1.0,
                'church_name': normalize_text(data.get('Church Name')),
                'church_address': normalize_text(data.get('Church Address')),
                'pastor_name': normalize_text(data.get('Pastor Name')),
                'next_of_kin_name': normalize_text(data.get('Next of Kin Name')),
                'next_of_kin_surname': normalize_text(data.get('Next of Kin Surname')),
                'relationship': normalize_text(data.get('Relationship')),
                'contact_number': normalize_text(data.get('Contact Number')),
            }
        )

    return records, warnings
