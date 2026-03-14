def normalize_text(value):
    if value is None:
        return ""
    return str(value).strip()


def normalize_float(value):
    text = normalize_text(value)
    if not text:
        return None

    normalized = text.replace(' ', '').replace(',', '.')
    try:
        return float(normalized)
    except ValueError:
        return None


def build_full_address(address, city, province, country):
    return ", ".join([part for part in [address, city, province, country] if part])


def is_valid_sa_coordinate_pair(latitude, longitude):
    if latitude is None or longitude is None:
        return False
    return -35.5 <= latitude <= -22.0 and 16.0 <= longitude <= 33.5


def normalize_coordinates(latitude, longitude):
    lat = normalize_float(latitude)
    lng = normalize_float(longitude)

    if lat is None or lng is None:
        return lat, lng

    if is_valid_sa_coordinate_pair(lat, lng):
        return lat, lng

    if is_valid_sa_coordinate_pair(lng, lat):
        return lng, lat

    return lat, lng
