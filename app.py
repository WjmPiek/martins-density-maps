import json
import os
import threading
import time
from copy import deepcopy
from pathlib import Path
from urllib.parse import quote_plus

import requests
from flask import Flask, jsonify, request, send_from_directory
from openpyxl import load_workbook

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data")).resolve()
WORKBOOK_PATH = DATA_DIR / "martins_density_map_data.xlsx"
CACHE_PATH = DATA_DIR / "geocode_cache.json"

app = Flask(__name__, static_folder="static")
_lock = threading.Lock()

REQUIRED_HEADERS = [
    "MF File", "Deceased Name", "Deceased Surname", "DOD", "Address",
    "City", "Province", "Country", "Full Address", "Latitude", "Longitude",
    "Weight", "Next of Kin Name", "Next of Kin Surname", "Relationship", "Contact Number"
]
KNOWN_PROVINCES = [
    "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo",
    "Mpumalanga", "North West", "Northern Cape", "Western Cape",
]
PROVINCE_MAP = {p.lower(): p for p in KNOWN_PROVINCES}
DEFAULT_COUNTRY = "South Africa"


def ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def load_cache():
    if CACHE_PATH.exists():
        try:
            payload = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
            return payload if isinstance(payload, dict) else {}
        except Exception:
            return {}
    return {}


def save_cache(cache):
    ensure_data_dir()
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_text(value):
    if value is None:
        return ""
    return str(value).strip()


def normalize_phone(value):
    text = normalize_text(value)
    return text.replace(".0", "") if text.endswith(".0") else text


def clean_province(value):
    text = normalize_text(value)
    if not text:
        return ""
    return PROVINCE_MAP.get(text.lower(), text)


def build_full_address(row):
    parts = [
        normalize_text(row.get("Address")),
        normalize_text(row.get("City")),
        clean_province(row.get("Province")),
        normalize_text(row.get("Country")) or DEFAULT_COUNTRY,
    ]
    return ", ".join([p for p in parts if p])


def normalize_cache_key(address):
    return " ".join(normalize_text(address).lower().replace(",", " ").split())


def to_float(value):
    try:
        if value in (None, ""):
            return None
        return float(value)
    except Exception:
        return None


def google_geocode(address, api_key):
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    response = requests.get(url, params={"address": address, "key": api_key}, timeout=25)
    response.raise_for_status()
    payload = response.json()
    if payload.get("status") != "OK" or not payload.get("results"):
        return None
    result = payload["results"][0]
    location = result["geometry"]["location"]
    return {
        "lat": float(location["lat"]),
        "lng": float(location["lng"]),
        "formatted_address": result.get("formatted_address", address),
        "place_id": result.get("place_id", ""),
        "location_type": result.get("geometry", {}).get("location_type", ""),
        "types": result.get("types", []),
        "aliases": [normalize_cache_key(address), normalize_cache_key(result.get("formatted_address", ""))],
        "updated_at": int(time.time()),
    }


def get_cache_hit(cache, full_address):
    key = normalize_cache_key(full_address)
    if not key:
        return None
    direct = cache.get(key)
    if direct:
        return direct
    for item_key, item in cache.items():
        aliases = item.get("aliases") or []
        if key == item_key or key in aliases:
            return item
    return None


def seed_cache_from_row(cache, row):
    full_address = normalize_text(row.get("Full Address")) or build_full_address(row)
    lat = to_float(row.get("Latitude"))
    lng = to_float(row.get("Longitude"))
    if not full_address or lat is None or lng is None:
        return False
    key = normalize_cache_key(full_address)
    if not key:
        return False
    entry = cache.get(key, {})
    aliases = set(entry.get("aliases") or [])
    aliases.add(key)
    cache[key] = {
        **entry,
        "lat": lat,
        "lng": lng,
        "formatted_address": full_address,
        "aliases": sorted(a for a in aliases if a),
        "updated_at": int(time.time()),
    }
    return True


def read_workbook_rows():
    ensure_data_dir()
    wb = load_workbook(WORKBOOK_PATH)
    ws = wb[wb.sheetnames[0]]
    headers = [normalize_text(cell.value) for cell in ws[1]]
    missing = [h for h in REQUIRED_HEADERS if h not in headers]
    if missing:
        raise ValueError(f"Workbook is missing columns: {', '.join(missing)}")

    header_index = {name: idx + 1 for idx, name in enumerate(headers)}
    rows = []
    for row_num in range(2, ws.max_row + 1):
        row = {header: ws.cell(row=row_num, column=col_num).value for header, col_num in header_index.items()}
        if all(row.get(h) in (None, "") for h in REQUIRED_HEADERS):
            continue
        row["_row_number"] = row_num
        rows.append(row)
    return wb, ws, header_index, rows


def validate_row_payload(payload, for_update=False):
    data = {key: normalize_text(payload.get(key)) for key in REQUIRED_HEADERS if key in payload}
    data.setdefault("Country", DEFAULT_COUNTRY)
    data["Province"] = clean_province(data.get("Province"))
    errors = []

    if not any([data.get("Address"), data.get("Full Address")]):
        errors.append("Address is required.")
    if not any([data.get("City"), data.get("Province")]):
        errors.append("City or Province is required.")
    if data.get("Province") and data["Province"] not in KNOWN_PROVINCES:
        errors.append(f"Province must match one of: {', '.join(KNOWN_PROVINCES)}.")
    if data.get("Latitude") and to_float(data.get("Latitude")) is None:
        errors.append("Latitude must be numeric.")
    if data.get("Longitude") and to_float(data.get("Longitude")) is None:
        errors.append("Longitude must be numeric.")
    if data.get("Weight") and to_float(data.get("Weight")) is None:
        errors.append("Weight must be numeric.")
    if not data.get("Full Address"):
        data["Full Address"] = build_full_address(data)
    data["Contact Number"] = normalize_phone(data.get("Contact Number"))
    return data, errors


def workbook_validation_summary(rows):
    warnings = []
    seen = {}
    valid_rows = 0
    for row in rows:
        full_address = normalize_text(row.get("Full Address")) or build_full_address(row)
        if full_address:
            valid_rows += 1
        key = normalize_cache_key(full_address)
        if key:
            seen[key] = seen.get(key, 0) + 1
        if normalize_text(row.get("Province")) and clean_province(row.get("Province")) not in KNOWN_PROVINCES:
            warnings.append(f"Row {row['_row_number']}: unknown province '{normalize_text(row.get('Province'))}'.")
        if to_float(row.get("Latitude")) is None or to_float(row.get("Longitude")) is None:
            if not full_address:
                warnings.append(f"Row {row['_row_number']}: missing address and coordinates.")

    duplicates = [k for k, count in seen.items() if count > 1]
    if duplicates:
        warnings.append(f"Found {len(duplicates)} duplicate address entries.")

    return {
        "validRows": valid_rows,
        "warningCount": len(warnings),
        "warnings": warnings[:12],
    }


def row_to_feature(row):
    full_address = normalize_text(row.get("Full Address")) or build_full_address(row)
    lat = to_float(row.get("Latitude"))
    lng = to_float(row.get("Longitude"))
    city = normalize_text(row.get("City"))
    province = clean_province(row.get("Province"))
    country = normalize_text(row.get("Country")) or DEFAULT_COUNTRY
    name = f"{normalize_text(row.get('Deceased Name'))} {normalize_text(row.get('Deceased Surname'))}".strip()
    next_of_kin = " ".join(filter(None, [normalize_text(row.get("Next of Kin Name")), normalize_text(row.get("Next of Kin Surname"))])).strip()
    gm_query = quote_plus(full_address or city or province)
    return {
        "id": normalize_text(row.get("MF File")) or str(row["_row_number"]),
        "rowNumber": row["_row_number"],
        "mfFile": normalize_text(row.get("MF File")),
        "name": name,
        "deceasedName": normalize_text(row.get("Deceased Name")),
        "deceasedSurname": normalize_text(row.get("Deceased Surname")),
        "dod": normalize_text(row.get("DOD")),
        "address": normalize_text(row.get("Address")),
        "city": city,
        "province": province,
        "country": country,
        "fullAddress": full_address,
        "lat": lat,
        "lng": lng,
        "weight": to_float(row.get("Weight")) or 1.0,
        "nextOfKinName": normalize_text(row.get("Next of Kin Name")),
        "nextOfKinSurname": normalize_text(row.get("Next of Kin Surname")),
        "nextOfKin": next_of_kin,
        "relationship": normalize_text(row.get("Relationship")),
        "contactNumber": normalize_phone(row.get("Contact Number")),
        "googleMapsUrl": f"https://www.google.com/maps/search/?api=1&query={gm_query}",
        "hoverSummary": " | ".join([p for p in [name, city, province] if p]),
    }


def maybe_geocode_and_persist(rows, wb, ws, header_index):
    api_key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    cache = load_cache()
    changed = False
    geocoded_count = 0
    cached_count = 0
    unresolved = 0

    for row in rows:
        row["Province"] = clean_province(row.get("Province"))
        if normalize_text(row.get("Contact Number")):
            row["Contact Number"] = normalize_phone(row.get("Contact Number"))
            ws.cell(row=row["_row_number"], column=header_index["Contact Number"]).value = row["Contact Number"]
            changed = True

        full_address = normalize_text(row.get("Full Address")) or build_full_address(row)
        if full_address and normalize_text(row.get("Full Address")) != full_address:
            row["Full Address"] = full_address
            ws.cell(row=row["_row_number"], column=header_index["Full Address"]).value = full_address
            changed = True

        lat = to_float(row.get("Latitude"))
        lng = to_float(row.get("Longitude"))
        if lat is not None and lng is not None:
            if seed_cache_from_row(cache, row):
                changed = True
            continue

        cached = get_cache_hit(cache, full_address)
        if cached and cached.get("lat") is not None and cached.get("lng") is not None:
            row["Latitude"] = cached["lat"]
            row["Longitude"] = cached["lng"]
            row["Full Address"] = cached.get("formatted_address") or full_address
            ws.cell(row=row["_row_number"], column=header_index["Latitude"]).value = cached["lat"]
            ws.cell(row=row["_row_number"], column=header_index["Longitude"]).value = cached["lng"]
            ws.cell(row=row["_row_number"], column=header_index["Full Address"]).value = row["Full Address"]
            changed = True
            cached_count += 1
            continue

        if api_key and full_address:
            try:
                geocoded = google_geocode(full_address, api_key)
            except Exception:
                geocoded = None
            if geocoded:
                key = normalize_cache_key(geocoded.get("formatted_address") or full_address)
                aliases = set(geocoded.get("aliases") or [])
                aliases.add(normalize_cache_key(full_address))
                geocoded["aliases"] = sorted(a for a in aliases if a)
                cache[key] = geocoded
                row["Latitude"] = geocoded["lat"]
                row["Longitude"] = geocoded["lng"]
                row["Full Address"] = geocoded.get("formatted_address") or full_address
                ws.cell(row=row["_row_number"], column=header_index["Latitude"]).value = geocoded["lat"]
                ws.cell(row=row["_row_number"], column=header_index["Longitude"]).value = geocoded["lng"]
                ws.cell(row=row["_row_number"], column=header_index["Full Address"]).value = row["Full Address"]
                changed = True
                geocoded_count += 1
                continue

        unresolved += 1

    if changed:
        wb.save(WORKBOOK_PATH)
        save_cache(cache)

    return {
        "geocodedThisRun": geocoded_count,
        "filledFromCache": cached_count,
        "googleGeocodingEnabled": bool(api_key),
        "unresolved": unresolved,
    }


def write_row(ws, header_index, row_number, payload):
    for header in REQUIRED_HEADERS:
        value = payload.get(header, "")
        if header in {"Latitude", "Longitude", "Weight"}:
            value = to_float(value)
        ws.cell(row=row_number, column=header_index[header]).value = value if value not in (None, "") else None


def feature_payload(rows, geo_stats=None):
    features = [row_to_feature(r) for r in rows]
    towns = sorted({f["city"] for f in features if f["city"]})
    provinces = sorted({f["province"] for f in features if f["province"]})
    ready = [f for f in features if f["lat"] is not None and f["lng"] is not None]
    payload = {
        "count": len(features),
        "mappedCount": len(ready),
        "towns": towns,
        "provinces": provinces,
        "features": features,
    }
    if geo_stats:
        payload.update(geo_stats)
    return payload


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/health")
def health():
    return jsonify({"ok": True})


@app.route("/api/data")
def api_data():
    with _lock:
        wb, ws, header_index, rows = read_workbook_rows()
        geo_stats = maybe_geocode_and_persist(rows, wb, ws, header_index)
        payload = feature_payload(rows, geo_stats)
        payload.update(workbook_validation_summary(rows))
        return jsonify(payload)


@app.route("/api/rows", methods=["POST"])
def save_row():
    data = request.get_json(silent=True) or {}
    row_number = int(data.get("rowNumber") or 0)
    cleaned, errors = validate_row_payload(data, for_update=bool(row_number))
    if errors:
        return jsonify({"ok": False, "errors": errors}), 400

    with _lock:
        wb, ws, header_index, rows = read_workbook_rows()
        if row_number:
            target = next((r for r in rows if r["_row_number"] == row_number), None)
            if not target:
                return jsonify({"ok": False, "error": "Row not found."}), 404
            current = deepcopy(target)
            current.update(cleaned)
            cleaned = current
        else:
            row_number = ws.max_row + 1
            cleaned.setdefault("MF File", str(int(time.time())))

        cleaned.setdefault("Country", DEFAULT_COUNTRY)
        cleaned["Full Address"] = normalize_text(cleaned.get("Full Address")) or build_full_address(cleaned)
        write_row(ws, header_index, row_number, cleaned)
        ws.cell(row=row_number, column=header_index["Contact Number"]).number_format = "@"
        wb.save(WORKBOOK_PATH)

        wb, ws, header_index, rows = read_workbook_rows()
        geo_stats = maybe_geocode_and_persist(rows, wb, ws, header_index)
        payload = feature_payload(rows, geo_stats)

    return jsonify({"ok": True, "message": "Address saved.", **payload})


@app.route("/api/rows/<int:row_number>", methods=["DELETE"])
def delete_row(row_number):
    with _lock:
        wb, ws, header_index, rows = read_workbook_rows()
        target = next((r for r in rows if r["_row_number"] == row_number), None)
        if not target:
            return jsonify({"ok": False, "error": "Row not found."}), 404
        ws.delete_rows(row_number, 1)
        wb.save(WORKBOOK_PATH)
        wb, ws, header_index, rows = read_workbook_rows()
        geo_stats = maybe_geocode_and_persist(rows, wb, ws, header_index)
        payload = feature_payload(rows, geo_stats)
    return jsonify({"ok": True, "message": "Address deleted.", **payload})


@app.route("/api/upload", methods=["POST"])
def upload():
    file = request.files.get("file")
    if not file or not file.filename.lower().endswith(".xlsx"):
        return jsonify({"ok": False, "error": "Please upload a .xlsx file."}), 400

    with _lock:
        ensure_data_dir()
        file.save(WORKBOOK_PATH)
        wb, ws, header_index, rows = read_workbook_rows()
        summary = workbook_validation_summary(rows)
        if summary["validRows"] == 0:
            return jsonify({"ok": False, "error": "Workbook has no valid address rows."}), 400
        geo_stats = maybe_geocode_and_persist(rows, wb, ws, header_index)

    return jsonify({
        "ok": True,
        "message": "Workbook replaced successfully.",
        **summary,
        **geo_stats,
    })


@app.route("/download/data")
def download_data():
    return send_from_directory(DATA_DIR, WORKBOOK_PATH.name, as_attachment=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
