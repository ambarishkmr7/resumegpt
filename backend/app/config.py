from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Security
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_use_openssl_rand_hex_32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    RESET_TOKEN_EXPIRE_MINUTES: int = 30

    # Database — MySQL (or SQLite for dev)
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_NAME: str = "resumegpt_db"
    DB_USER: str = "root"
    DB_PASSWORD: str = ""
    DATABASE_URL: str = ""  # auto-built from DB_* if empty

    @property
    def database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset=utf8mb4"

    # File storage
    STORAGE_DIR: str = "./storage"
    MAX_UPLOAD_MB: int = 10

    # S3-compatible storage (Cloudflare R2, AWS S3, MinIO, …)
    # Set to "s3" to enable cloud storage; "local" keeps filesystem backend.
    STORAGE_BACKEND: str = "local"          # "local" | "s3"
    S3_ENDPOINT_URL: str = ""               # R2: https://<account_id>.r2.cloudflarestorage.com  |  AWS: leave empty
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    S3_BUCKET_NAME: str = "resumegpt"
    S3_REGION: str = "auto"                 # R2 uses "auto"; AWS e.g. "us-east-1"

    # AI provider (optional)
    ANTHROPIC_API_KEY: str = ""
    AI_MODEL: str = "claude-sonnet-4-20250514"

    # Google Gemini (FREE tier — 15 RPM, 1M tokens/day)
    # Get key from: https://aistudio.google.com/app/apikey
    GEMINI_API_KEY: str = ""

    # xAI Grok (OpenAI-compatible API)
    # Get key from: https://console.x.ai
    GROK_API_KEY: str = ""
    GROK_MODEL: str = "grok-3-mini"  # or grok-3 for full model

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # Facebook OAuth
    FACEBOOK_APP_ID: str = ""
    FACEBOOK_APP_SECRET: str = ""

    # Razorpay
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""

    # Logging
    LOG_LEVEL: str = "INFO"                 # DEBUG | INFO | WARNING | ERROR | CRITICAL

    # CORS
    FRONTEND_ORIGIN: str = "http://localhost:5173"

    # Admin seed (optional)
    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
