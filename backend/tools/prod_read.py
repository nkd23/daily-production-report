"""Read-only look at the production database (Supabase), for checking data.

    cd backend
    .venv/Scripts/python.exe -m tools.prod_read "print(db.scalar(select(func.count()).select_from(CloseOrderItem)))"

The code runs with `db` (a Session), `select`, `func`, `date`, `datetime`
and every model from app.models in scope. Every transaction is READ ONLY
(PostgreSQL refuses any INSERT/UPDATE/DELETE/DDL) and is rolled back at the
end. The connection string is read from ~/.duy1-deploy/supabase_urls.py,
never from the repo, and is masked out of any error message."""

import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path.home() / ".duy1-deploy"))

import app.models as models  # noqa: E402
from supabase_urls import urls  # noqa: E402


def _mask(text: str) -> str:
    return re.sub(r"://[^\s@/]+@", "://***@", text)


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    engine = create_engine(urls()["session"], pool_pre_ping=True)

    @event.listens_for(engine, "connect")
    def _read_only(dbapi_connection, _record):
        cur = dbapi_connection.cursor()
        cur.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
        cur.close()
        dbapi_connection.commit()

    scope = {name: getattr(models, name) for name in dir(models) if not name.startswith("_")}
    scope.update(select=select, func=func, date=date, datetime=datetime, timedelta=timedelta)
    with Session(engine) as db:
        scope["db"] = db
        try:
            exec(sys.argv[1], scope)
        except Exception as exc:  # never print the connection string
            print(f"{type(exc).__name__}: {_mask(str(exc))}")
            sys.exit(1)
        finally:
            db.rollback()
    engine.dispose()


if __name__ == "__main__":
    main()
