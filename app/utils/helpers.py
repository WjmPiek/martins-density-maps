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


def build_full_address(*parts):
    return ', '.join([part for part in (normalize_text(part) for part in parts) if part])
