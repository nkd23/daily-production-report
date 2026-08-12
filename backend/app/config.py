from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "mysql+pymysql://root:root@localhost:3306/duy1_production"
    secret_key: str = "dev-secret-key-change-me"
    access_token_expire_minutes: int = 480
    algorithm: str = "HS256"
    report_lock_hour: int = 21
    cors_origins: str = "http://localhost:3000"
    app_timezone: str = "Asia/Ho_Chi_Minh"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
