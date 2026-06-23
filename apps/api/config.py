"""
ViraEdit — Application configuration.

All settings come from environment variables (or .env file).
Validated on startup — app refuses to start if required vars are missing.

Usage:
    from config import settings
    print(settings.DATABASE_URL)
"""
from __future__ import annotations

from pathlib import Path
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_env_file() -> Path | None:
    """Search for .env file starting from api dir up to project root."""
    candidates = [
        Path(".env"),                          # cwd is apps/api
        Path(__file__).parent.parent.parent / ".env",  # project root
        Path(__file__).parent / ".env",        # apps/api/.env
    ]
    for path in candidates:
        if path.exists():
            return path.resolve()
    return None


_ENV_FILE = _find_env_file()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE else None,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # ignore unknown env vars
    )

    # ── Application ────────────────────────────────────────────────────────────
    ENVIRONMENT: str = Field(default="development")
    API_HOST: str = Field(default="0.0.0.0")
    API_PORT: int = Field(default=8000)
    APP_VERSION: str = Field(default="0.1.0")
    DEBUG: bool = Field(default=False)

    # ── Database ───────────────────────────────────────────────────────────────
    DATABASE_URL: str = Field(
        default="postgresql://viraedit:viraedit_dev_password@localhost:5432/viraedit"
    )
    DB_ECHO: bool = Field(default=False)
    DB_POOL_SIZE: int = Field(default=10)
    DB_MAX_OVERFLOW: int = Field(default=20)

    # ── Redis ──────────────────────────────────────────────────────────────────
    REDIS_URL: str = Field(default="redis://localhost:6379/0")

    # ── Object Storage (MinIO / S3-compatible) ─────────────────────────────────
    S3_ENDPOINT_URL: str = Field(default="http://localhost:9000")
    S3_ACCESS_KEY_ID: str = Field(default="minioadmin")
    S3_SECRET_ACCESS_KEY: str = Field(default="minioadmin123")
    S3_REGION: str = Field(default="us-east-1")
    S3_BUCKET_MEDIA: str = Field(default="viraedit-media")
    S3_BUCKET_RENDERS: str = Field(default="viraedit-renders")
    S3_BUCKET_TEMP: str = Field(default="viraedit-temp")

    # ── CORS ───────────────────────────────────────────────────────────────────
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000"]
    )

    # ── Auth (JWT) ─────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = Field(default="dev-secret-change-in-production-please")
    JWT_ALGORITHM: str = Field(default="HS256")
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=15)
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7)

    # ── Rate Limiting ──────────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = Field(default=60)     # general endpoints
    RATE_LIMIT_AUTH_PER_MINUTE: int = Field(default=10)  # auth endpoints (stricter)
    RATE_LIMIT_UPLOAD_PER_MINUTE: int = Field(default=5)  # file uploads

    # ── AI — OpenAI (text analysis, suggestions, hooks, editing) ─────────────
    OPENAI_API_KEY: str = Field(default="")
    OPENAI_MODEL_PRIMARY: str = Field(default="gpt-4o-mini")
    OPENAI_MODEL_FAST: str = Field(default="gpt-4o-mini")

    # ── AI — ElevenLabs (speech-to-text: Scribe only) ────────────────────────
    ELEVENLABS_API_KEY: str = Field(default="")
    ELEVENLABS_STT_MODEL: str = Field(default="scribe_v2")
    ELEVENLABS_STT_COST_PER_HOUR_USD: float = Field(default=0.50)

    # ── AI — Anthropic (optional: premium hook rewrites) ──────────────────────
    ANTHROPIC_API_KEY: str = Field(default="")

    # ── AI Budget ─────────────────────────────────────────────────────────────
    AI_COST_LIMIT_USD_PER_HOUR: float = Field(default=2.00)  # hard limit
    AI_COST_WARN_USD_PER_HOUR: float = Field(default=1.60)   # warning threshold

    # ── Style extraction ───────────────────────────────────────────────────────
    # EasyOCR on CPU can stall 5–15 min per reference; OpenCV fallback is fast.
    STYLE_EXTRACT_USE_EASYOCR: bool = Field(default=False)

    # ── Celery ────────────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = Field(default="redis://localhost:6379/0")
    CELERY_RESULT_BACKEND: str = Field(default="redis://localhost:6379/1")
    # CRITICAL: Always solo on Windows — prefork pool breaks
    CELERY_WORKER_POOL: str = Field(default="solo")

    # ── FFmpeg ────────────────────────────────────────────────────────────────
    FFMPEG_PATH: str = Field(default="ffmpeg")
    FFPROBE_PATH: str = Field(default="ffprobe")

    # ── Nepali / speech-to-text ───────────────────────────────────────────────
    # Core rule: always transcribe as Nepali (passed to ElevenLabs as language_code=nep)
    WHISPER_LANGUAGE: str = Field(default="ne")
    # Legacy name — same as ELEVENLABS_STT_MODEL (scribe_v2)
    WHISPER_MODEL: str = Field(default="scribe_v2")

    # ── Fonts ─────────────────────────────────────────────────────────────────
    # Devanagari font — used ONLY for video caption rendering, never UI
    DEVANAGARI_FONT_PATH: str = Field(
        default="C:/Windows/Fonts/NotoSansDevanagari-Regular.ttf"
    )

    # ── Derived properties ─────────────────────────────────────────────────────

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def async_database_url(self) -> str:
        """Return DATABASE_URL with asyncpg driver for SQLAlchemy async."""
        url = self.DATABASE_URL.replace("postgres://", "postgresql://")
        if not url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    @field_validator("WHISPER_LANGUAGE")
    @classmethod
    def whisper_language_must_be_nepali(cls, v: str) -> str:
        """Enforce the core rule: STT always uses Nepali."""
        if v != "ne":
            raise ValueError(
                f"WHISPER_LANGUAGE must be 'ne' (Nepali). Got '{v}'. "
                "Hard rule: all transcription is Nepali-first."
            )
        return v

    @field_validator("ELEVENLABS_API_KEY")
    @classmethod
    def elevenlabs_api_key_format(cls, v: str) -> str:
        """Reject common copy-paste mistakes (dashboard IDs, not sk_ secrets)."""
        if not v or not v.strip():
            return v
        key = v.strip()
        if key.startswith("sk_"):
            if len(key) < 40:
                raise ValueError("ELEVENLABS_API_KEY looks truncated (too short).")
            return key
        # ElevenLabs also issues 64-char hex API secrets (no sk_ prefix).
        if len(key) == 64 and all(c in "0123456789abcdef" for c in key.lower()):
            return key
        if len(key) == 32 and all(c in "0123456789abcdef" for c in key.lower()):
            raise ValueError(
                "ELEVENLABS_API_KEY looks like a dashboard ID, not a secret key. "
                "Copy the full API secret from elevenlabs.io/app/settings/api-keys."
            )
        raise ValueError(
            "ELEVENLABS_API_KEY format is invalid. "
            "Copy the full API secret from Settings → API Keys on elevenlabs.io."
        )


# Singleton — imported everywhere as `from config import settings`
settings = Settings()
