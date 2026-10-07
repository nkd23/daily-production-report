"""Bring the database schema up to date on container start.

The Alembic history up to now was written against SQL Server (constraint
names, enum handling) and is not replayed on a brand-new database. Instead,
an empty database gets the current schema straight from the models and is
stamped at the latest revision; a database that already has tables just
runs any newer migrations.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.database import Base, engine


def main() -> None:
    cfg = Config(str(Path(__file__).with_name("alembic.ini")))
    if "users" not in inspect(engine).get_table_names():
        Base.metadata.create_all(engine)
        command.stamp(cfg, "head")
        print("Empty database: created schema from models and stamped Alembic head.")
    else:
        command.upgrade(cfg, "head")
        print("Existing database: applied pending migrations (if any).")


if __name__ == "__main__":
    main()
