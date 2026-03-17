from sqlalchemy import inspect, text

from .extensions import db


USER_COLUMNS = {
    "is_active": "BOOLEAN NOT NULL DEFAULT TRUE",
}

RECORD_COLUMNS = {
    "church_name": "VARCHAR(255)",
    "church_address": "VARCHAR(255)",
    "pastor_name": "VARCHAR(255)",
    "postal_code": "VARCHAR(40)",
}


def _add_missing_columns(table_name, required_columns):
    inspector = inspect(db.engine)
    existing = {col["name"] for col in inspector.get_columns(table_name)}
    missing = {name: ddl for name, ddl in required_columns.items() if name not in existing}
    if not missing:
        return

    with db.engine.begin() as conn:
        for column_name, ddl in missing.items():
            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}"))


def ensure_schema_compatibility():
    inspector = inspect(db.engine)
    table_names = set(inspector.get_table_names())
    if "user" in table_names:
        _add_missing_columns("user", USER_COLUMNS)
    if "record" in table_names:
        _add_missing_columns("record", RECORD_COLUMNS)
