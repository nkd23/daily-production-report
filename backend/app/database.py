from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import get_settings

settings = get_settings()

_engine_kwargs: dict = {"pool_pre_ping": True, "pool_recycle": 3600}
if make_url(settings.database_url).get_backend_name() == "postgresql":
    # Supabase's transaction pooler (and PgBouncer-style poolers in general)
    # hands each transaction to a different server connection, so psycopg's
    # automatic server-side prepared statements would break.
    _engine_kwargs["connect_args"] = {"prepare_threshold": None}
if settings.is_serverless:
    # Many short-lived function instances, each fronted by the pooler: keep
    # only a connection or two per instance.
    _engine_kwargs.update(pool_size=1, max_overflow=4)
else:
    # Sync endpoints run on FastAPI's 40-thread pool, so the default pool of
    # 5+10 connections would make requests queue for a connection at ~100 users.
    _engine_kwargs.update(pool_size=10, max_overflow=20)

engine = create_engine(settings.database_url, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
