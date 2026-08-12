"""Create the target SQL Server database if it doesn't exist yet.

The official mssql-server Docker image (unlike MySQL's MYSQL_DATABASE env
var) does not create an app database on first boot, so this runs once
before Alembic migrations in the container's startup command.
"""

import sqlalchemy
from sqlalchemy.engine import make_url

from app.config import get_settings


def main():
    url = make_url(get_settings().database_url)
    db_name = url.database
    master_url = url.set(database="master")

    engine = sqlalchemy.create_engine(master_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        exists = conn.exec_driver_sql(
            "SELECT 1 FROM sys.databases WHERE name = ?", (db_name,)
        ).first()
        if exists:
            print(f"Database '{db_name}' already exists.")
        else:
            conn.exec_driver_sql(f"CREATE DATABASE [{db_name}]")
            print(f"Created database '{db_name}'.")


if __name__ == "__main__":
    main()
