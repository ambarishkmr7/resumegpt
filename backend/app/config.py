from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator

_INSECURE_SECRET_DEFAULT = "CHANGE_ME_IN_PRODUCTION_use_openssl_rand_hex_32"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Runtime environment — "development" | "production"
    # In production, insecure defaults (e.g. the placeholder SECRET_KEY) are
    # rejected at startup, and dev-only conveniences (returning reset links /
    # OTPs in API responses) are disabled.
    APP_ENV: str = "development"

    # Security
    SECRET_KEY: str = _INSECURE_SECRET_DEFAULT
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    RESET_TOKEN_EXPIRE_MINUTES: int = 30

    # Database — MySQL (or SQLite for dev)
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_NAME: str = "resumes-gpt_db"
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
    S3_BUCKET_NAME: str = "resume"
    S3_REGION: str = "auto"                 # R2 uses "auto"; AWS e.g. "us-east-1"

    # AI provider (optional)
    ANTHROPIC_API_KEY: str = ""
    AI_MODEL: str = "gemini-flash-lite-latest"

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

    # SMTP — for email OTP (Gmail: host=smtp.gmail.com, port=587, use App Password)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""       # sender Gmail address  — set in .env
    SMTP_PASSWORD: str = ""   # Gmail App Password    — set in .env
    SMTP_FROM: str = ""       # leave empty to use SMTP_USER; Gmail only allows your own address

    # Admin seed (optional)
    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = ""

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.strip().lower() in {"production", "prod"}

    @model_validator(mode="after")
    def _enforce_production_safety(self):
        """Refuse to boot in production with insecure defaults."""
        if self.is_production:
            problems = []
            if not self.SECRET_KEY or self.SECRET_KEY == _INSECURE_SECRET_DEFAULT:
                problems.append("SECRET_KEY must be overridden (run: openssl rand -hex 32)")
            if self.FRONTEND_ORIGIN.startswith("http://localhost"):
                problems.append("FRONTEND_ORIGIN still points at localhost")
            if problems:
                raise ValueError(
                    "Insecure configuration for APP_ENV=production: "
                    + "; ".join(problems)
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
