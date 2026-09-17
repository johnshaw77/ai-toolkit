"""設定。所有可調的東西都從 .env 進來，程式裡不寫死。"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """從 .env 讀進來的設定。欄位名小寫，環境變數名大寫，pydantic 自動對應。"""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    project_name: str = "{{title}}"
    api_v1_prefix: str = "/api/v1"

    database_url: str = "{{database_url}}"
    sql_echo: bool = False

    secret_key: str = "dev-only-change-me-before-deploying-anywhere-0123456789"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # 逗號分隔的字串而不是 list：.env 放不下 JSON，這樣最不容易寫錯。
    cors_origins: str = "http://127.0.0.1:{{frontend_port}},http://localhost:{{frontend_port}}"

    seed_admin_email: str = "admin@example.com"
    seed_admin_password: str = "admin1234"

    @property
    def cors_origin_list(self) -> list[str]:
        """把逗號分隔的來源切成清單。"""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
