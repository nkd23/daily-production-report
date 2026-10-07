from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = (
        "mssql+pyodbc://localhost/duy1_production"
        "?driver=ODBC+Driver+17+for+SQL+Server&trusted_connection=yes"
    )
    secret_key: str = "dev-secret-key-change-me"
    access_token_expire_minutes: int = 480
    algorithm: str = "HS256"
    # Hour (0-24, local time) after which today's reports lock for Tổ trưởng.
    # 24 = never during the day: a report stays editable until midnight, then
    # locks as a past date (see app.deps.is_past_lock_hour).
    report_lock_hour: int = 24
    cors_origins: str = "http://localhost:3000"
    app_timezone: str = "Asia/Ho_Chi_Minh"
    # Reports/history older than this many days are purged automatically -
    # see app.services.retention. 0 disables the purge entirely.
    data_retention_days: int = 60
    # "production" refuses to start with a placeholder SECRET_KEY and hides the
    # interactive API docs; anything else is treated as local development.
    environment: str = "development"
    # Sent by Vercel Cron as "Authorization: Bearer <CRON_SECRET>" - see
    # /api/cron/retention in app.main.
    cron_secret: str = ""
    # Set automatically by Vercel at runtime.
    vercel: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def is_serverless(self) -> bool:
        return bool(self.vercel)


PLACEHOLDER_SECRET_PREFIXES = ("dev-secret", "change-this", "changeme")


@lru_cache
def get_settings() -> Settings:
    return Settings()
