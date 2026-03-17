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
    return ", ".join([part for part in [address, city, province, country] if part])
