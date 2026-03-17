from sqlalchemy import inspect, text

from .extensions import db


def _quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _column_exists(inspector, table_name: str, column_name: str) -> bool:
    try:
        return any(col['name'] == column_name for col in inspector.get_columns(table_name))
    except Exception:
        return False


def ensure_schema() -> None:
    """Best-effort schema patching for existing databases.

    Uses quoted identifiers so PostgreSQL reserved table names like "user"
    do not break ALTER TABLE statements.
    """
    engine = db.engine
    inspector = inspect(engine)

    patches = {
        'user': [
            ('is_active', 'BOOLEAN NOT NULL DEFAULT TRUE'),
        ],
        'record': [
            ('deceased_address', 'VARCHAR(255)'),
            ('church_name', 'VARCHAR(255)'),
            ('church_address', 'VARCHAR(255)'),
            ('pastor_name', 'VARCHAR(255)'),
            ('postal_code', 'VARCHAR(64)'),
        ],
    }

    with engine.begin() as conn:
        for table_name, columns in patches.items():
            if table_name not in inspector.get_table_names():
                continue
            for column_name, sql_type in columns:
                if _column_exists(inspector, table_name, column_name):
                    continue
                conn.execute(
                    text(
                        f'ALTER TABLE {_quote(table_name)} '
                        f'ADD COLUMN {_quote(column_name)} {sql_type}'
                    )
                )
