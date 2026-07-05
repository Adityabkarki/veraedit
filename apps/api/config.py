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
    """Search for .env file — project root first (stable regardless of cwd)."""
    candidates = [
        Path(__file__).parent.parent.parent / ".env",  # project root
        Path(".env"),                          # cwd (e.g. apps/api)
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

    # ── AI — Google Gemini (vision style analysis, image gen) ───────────────
    GEMINI_API_KEY: str = Field(default="")
    GEMINI_VISION_MODEL: str = Field(default="gemini-2.0-flash")
    GEMINI_IMAGE_MODEL: str = Field(default="gemini-2.5-flash-image")
    OPENAI_IMAGE_MODEL: str = Field(default="dall-e-3")
    OPENAI_IMAGE_ENABLED: bool = Field(default=True)

    # ── Stock footage (Pexels) ─────────────────────────────────────────────────
    PEXELS_API_KEY: str = Field(default="")
    # When true, search Pexels first; AI image gen is fallback only.
    BROLL_PREFER_STOCK: bool = Field(default=False)

    # ── Speaker diarization (pyannote.audio) ───────────────────────────────────
    HUGGINGFACE_TOKEN: str = Field(default="")
    HF_TOKEN: str = Field(default="")  # alias accepted by pyannote
    DIARIZATION_ENABLED: bool = Field(default=True)
    PYANNOTE_DIARIZATION_MODEL: str = Field(
        default="pyannote/speaker-diarization-3.1",
    )

    # ── AI Budget ─────────────────────────────────────────────────────────────
    AI_COST_LIMIT_USD_PER_HOUR: float = Field(default=2.00)  # hard limit
    AI_COST_WARN_USD_PER_HOUR: float = Field(default=1.60)   # warning threshold
    AI_BUDGET_HARD_LIMIT_SWITCH_LOCAL: float = Field(default=0.8)

    # ── Style extraction ───────────────────────────────────────────────────────
    # EasyOCR on CPU can stall 5–15 min per reference; OpenCV fallback is fast.
    STYLE_EXTRACT_USE_EASYOCR: bool = Field(default=False)

    # ── Celery ────────────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = Field(default="redis://localhost:6379/1")
    CELERY_RESULT_BACKEND: str = Field(default="redis://localhost:6379/2")
    # CRITICAL: Always solo on Windows — prefork pool breaks
    # Linux: prefork allows parallel task execution
    CELERY_WORKER_POOL: str = Field(default="prefork")

    # ── FFmpeg ────────────────────────────────────────────────────────────────
    FFMPEG_PATH: str = Field(default="ffmpeg")
    FFPROBE_PATH: str = Field(default="ffprobe")

    # ── Edit proxy (ingest) — lightweight H.264 for editor playback ───────────
    # Original upload is kept for export. Default 540p balances size vs clarity.
    PROXY_MAX_HEIGHT: int = Field(default=540, ge=360, le=720)
    PROXY_CRF: int = Field(default=24, ge=18, le=32)
    PROXY_PRESET: str = Field(default="fast")
    PROXY_AUDIO_BITRATE: str = Field(default="96k")
    PROXY_TRANSCODE_TIMEOUT_SECONDS: int = Field(default=7200)

    # ── Nepali / speech-to-text ───────────────────────────────────────────────
    # Core rule: always transcribe as Nepali (passed to ElevenLabs as language_code=nep)
    WHISPER_LANGUAGE: str = Field(default="ne")
    # Legacy name — same as ELEVENLABS_STT_MODEL (scribe_v2)
    WHISPER_MODEL: str = Field(default="scribe_v2")

    # ── Remotion render service (internal only — do not expose port 3500) ─────
    REMOTION_SERVICE_URL: str = Field(default="http://127.0.0.1:3500")
    REMOTION_RENDER_TIMEOUT: float = Field(default=30.0)

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
