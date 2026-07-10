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

    # Gemini Live model used for the real-time audio mock interview
    INTERVIEW_LIVE_MODEL: str = "gemini-3.1-flash-live-preview"
    # Hard ceiling for a single live interview session (seconds)
    INTERVIEW_MAX_SECONDS: int = 30 * 60

    # xAI Grok (OpenAI-compatible API)
    # Get key from: https://console.x.ai
    GROK_API_KEY: str = ""
    GROK_MODEL: str = "grok-3-mini"  # or grok-3 for full model

    # ── Career chatbot (LangChain agent) production tuning ────────────────────
    # The agent (app/agent/graph.py) runs a middleware stack for production
    # robustness. SummarizationMiddleware compresses old turns once a thread
    # grows past CHATBOT_SUMMARY_TRIGGER_TOKENS (keeping the last KEEP_MESSAGES),
    # so long conversations stay within the context window and stay cheap. The
    # call-limit middlewares cap runaway tool/model loops per turn; the retry
    # middleware rides out transient provider errors (rate limits, timeouts).
    CHATBOT_SUMMARY_TRIGGER_TOKENS: int = 6000   # summarize once history exceeds this
    CHATBOT_SUMMARY_KEEP_MESSAGES: int = 12      # verbatim messages kept after summarizing
    CHATBOT_SUMMARY_MODEL: str = ""              # optional cheaper model; "" = reuse main model
    CHATBOT_MAX_MODEL_CALLS_PER_TURN: int = 12   # LLM calls per user turn (0 = unlimited)
    CHATBOT_MAX_TOOL_CALLS_PER_TURN: int = 10    # tool calls per user turn (0 = unlimited)
    CHATBOT_MODEL_MAX_RETRIES: int = 2           # retries on transient LLM errors

    # ── LLM usage & cost tracking ────────────────────────────────────────────
    # Every LLM call is logged (tokens + computed cost) to the llm_usage_logs
    # table for the admin "LLM Usage" dashboard. Set LLM_USAGE_TRACKING_ENABLED
    # to false to disable logging entirely (e.g. in tests).
    #
    # Pricing is USD per 1,000,000 tokens, split by provider + modality +
    # input/output, so changing a rate later (providers change pricing fairly
    # often) is a single env var edit — no code changes required. Modality
    # matters because providers bill text/image/audio/video/document input at
    # different rates. Defaults below are reasonable placeholders; confirm
    # current pricing on each provider's pricing page before relying on them
    # for real billing/finance.
    LLM_USAGE_TRACKING_ENABLED: bool = True
    LLM_PRICING_CURRENCY: str = "USD"

    # Gemini (per official Gemini API pricing tiers, e.g. Flash-class models)
    GEMINI_PRICE_TEXT_INPUT_PER_1M: float = 0.075
    GEMINI_PRICE_TEXT_OUTPUT_PER_1M: float = 0.30
    GEMINI_PRICE_IMAGE_INPUT_PER_1M: float = 0.075
    GEMINI_PRICE_AUDIO_INPUT_PER_1M: float = 1.00
    GEMINI_PRICE_AUDIO_OUTPUT_PER_1M: float = 0.30
    GEMINI_PRICE_VIDEO_INPUT_PER_1M: float = 0.075
    GEMINI_PRICE_DOCUMENT_INPUT_PER_1M: float = 0.075
    GEMINI_PRICE_CACHED_INPUT_PER_1M: float = 0.01875
    GEMINI_PRICE_THOUGHTS_PER_1M: float = 0.30  # thinking tokens billed as output

    # Anthropic Claude (Sonnet-class default; adjust if AI_MODEL points elsewhere)
    ANTHROPIC_PRICE_TEXT_INPUT_PER_1M: float = 3.00
    ANTHROPIC_PRICE_TEXT_OUTPUT_PER_1M: float = 15.00
    ANTHROPIC_PRICE_IMAGE_INPUT_PER_1M: float = 3.00  # images billed as input tokens

    # xAI Grok
    GROK_PRICE_TEXT_INPUT_PER_1M: float = 0.20
    GROK_PRICE_TEXT_OUTPUT_PER_1M: float = 0.50

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # Facebook OAuth
    FACEBOOK_APP_ID: str = ""
    FACEBOOK_APP_SECRET: str = ""

    # Razorpay
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    # Secret configured on the Razorpay webhook (Dashboard → Settings → Webhooks).
    # Used to verify the X-Razorpay-Signature on incoming webhook calls.
    RAZORPAY_WEBHOOK_SECRET: str = ""

    # Billing / metered interview usage. INTERVIEW_MAX_SECONDS remains a hard
    # per-session ceiling fallback; the real limit is the user's available
    # balance (see app/subscription/usage.py) capped by the admin-configurable
    # interview_hard_cap_seconds setting. USD_TO_INR_RATE seeds the Profit &
    # Loss report's currency conversion (also overridable as an admin setting).
    USD_TO_INR_RATE: float = 84.0

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
    # Optional gate for self-service registration on the /sys-admin page.
    # If set, the matching code is required to register. For admins, if this is
    # left empty, registration is allowed only while no admin exists (bootstrap).
    ADMIN_SIGNUP_CODE: str = ""
    AUTHOR_SIGNUP_CODE: str = ""

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
