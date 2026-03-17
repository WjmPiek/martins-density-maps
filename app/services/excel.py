from openpyxl import load_workbook

from ..constants import BASE_UPLOAD_COLUMNS, CHURCH_UPLOAD_COLUMNS, EXPORT_COLUMNS, UPLOAD_COLUMNS
from ..utils.helpers import build_full_address, normalize_float, normalize_text
from .geocoding import geocode_address


LEGACY_EXPORT_COLUMNS = [
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

REQUIRED_COLUMNS = {"MF File", "Address", "City", "Province", "Country"}
OPTIONAL_COLUMNS = set(UPLOAD_COLUMNS) | set(EXPORT_COLUMNS) | set(LEGACY_EXPORT_COLUMNS) | set(BASE_UPLOAD_COLUMNS) | set(
    CHURCH_UPLOAD_COLUMNS
)


ALIASES = {
    "Church": "Church Name",
    "Church Address Line": "Church Address",
    "Pastor": "Pastor Name",
    "Postcode": "Postal Code",
    "PostalCode": "Postal Code",
}


def _canonical_header(name):
    header = normalize_text(name)
    return ALIASES.get(header, header)


def parse_upload(file_storage):
    file_storage.stream.seek(0)
    wb = load_workbook(file_storage.stream, data_only=True)
    ws = wb[wb.sheetnames[0]]
    header_row = [_canonical_header(cell) for cell in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]

    if not REQUIRED_COLUMNS.issubset(set(header_row)):
        raise ValueError("Workbook columns do not match the required Martins template.")

    records = []
    warnings = []
    seen_mf = set()

    for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        raw = {_canonical_header(header): value for header, value in zip(header_row, row) if _canonical_header(header) in OPTIONAL_COLUMNS}
        mf_file = normalize_text(raw.get("MF File"))

        if not any(normalize_text(v) for v in raw.values()):
            continue
        if not mf_file:
            warnings.append(f"Row {idx}: missing MF File and skipped.")
            continue
        if mf_file in seen_mf:
            warnings.append(f"Row {idx}: duplicate MF File '{mf_file}' skipped.")
            continue
        seen_mf.add(mf_file)

        address = normalize_text(raw.get("Address"))
        city = normalize_text(raw.get("City"))
        province = normalize_text(raw.get("Province"))
        postal_code = normalize_text(raw.get("Postal Code"))
        country = normalize_text(raw.get("Country")) or "South Africa"
        full_address = normalize_text(raw.get("Full Address")) or build_full_address(
            address, city, province, postal_code, country
        )
        latitude = normalize_float(raw.get("Latitude"))
        longitude = normalize_float(raw.get("Longitude"))
        if latitude is None or longitude is None:
            latitude, longitude = geocode_address(full_address)

        records.append(
            {
                "mf_file": mf_file,
                "deceased_name": normalize_text(raw.get("Deceased Name")),
                "deceased_surname": normalize_text(raw.get("Deceased Surname")),
                "dod": normalize_text(raw.get("DOD")),
                "church_name": normalize_text(raw.get("Church Name")),
                "church_address": normalize_text(raw.get("Church Address")),
                "pastor_name": normalize_text(raw.get("Pastor Name")),
                "address": address,
                "city": city,
                "province": province,
                "postal_code": postal_code,
                "country": country,
                "full_address": full_address,
                "latitude": latitude,
                "longitude": longitude,
                "weight": normalize_float(raw.get("Weight")) or 1.0,
                "next_of_kin_name": normalize_text(raw.get("Next of Kin Name")),
                "next_of_kin_surname": normalize_text(raw.get("Next of Kin Surname")),
                "relationship": normalize_text(raw.get("Relationship")),
                "contact_number": normalize_text(raw.get("Contact Number")),
            }
        )

    return records, warnings
