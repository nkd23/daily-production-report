"""Move all app data between databases (e.g. SQL Server -> PostgreSQL).

    # on the old machine, pointed at the old database:
    python -m tools.transfer_data export data.json
    # on the new server, pointed at the new (empty, schema already created) database:
    python -m tools.transfer_data import data.json

Both commands use DATABASE_URL from the environment / .env, like the app.
Row ids are kept as-is so every foreign key still lines up, and on
PostgreSQL the id sequences are moved past the imported ids afterwards.
Import refuses to run on a database that already holds data.
"""

import enum
import json
import sys
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, func, select, text

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.database import Base, engine

# Parents before children. login_failures is short-lived throttle state, not data.
TABLES = [t for t in Base.metadata.sorted_tables if t.name != "login_failures"]


def _to_json(value):
    if isinstance(value, enum.Enum):
        return value.name
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def export_data(path: str) -> None:
    payload = {}
    with engine.connect() as conn:
        for table in TABLES:
            rows = conn.execute(select(table).order_by(*table.primary_key.columns)).mappings().all()
            payload[table.name] = [{k: _to_json(v) for k, v in row.items()} for row in rows]
            print(f"exported {table.name}: {len(rows)} rows")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    print(f"wrote {path}")


def _from_json(table, row: dict) -> dict:
    out = {}
    for name, value in row.items():
        col = table.columns[name]
        if value is not None and isinstance(col.type, DateTime):
            value = datetime.fromisoformat(value)
        elif value is not None and isinstance(col.type, Date):
            value = date.fromisoformat(value)
        out[name] = value
    return out


def import_data(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        payload = json.load(f)

    with engine.begin() as conn:
        for table in TABLES:
            existing = conn.execute(select(func.count()).select_from(table)).scalar_one()
            if existing:
                sys.exit(f"Refusing to import: table {table.name} already has {existing} rows.")

        for table in TABLES:
            rows = [_from_json(table, r) for r in payload.get(table.name, [])]
            if rows:
                conn.execute(table.insert(), rows)
            print(f"imported {table.name}: {len(rows)} rows")

        if conn.dialect.name == "postgresql":
            for table in TABLES:
                pk = list(table.primary_key.columns)
                if len(pk) == 1 and pk[0].autoincrement:
                    conn.execute(
                        text(
                            f"SELECT setval(pg_get_serial_sequence('{table.name}', '{pk[0].name}'), "
                            f"COALESCE((SELECT MAX({pk[0].name}) FROM {table.name}), 0) + 1, false)"
                        )
                    )
    print("import complete")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("export", "import"):
        sys.exit("usage: python -m tools.transfer_data export|import <file.json>")
    (export_data if sys.argv[1] == "export" else import_data)(sys.argv[2])
