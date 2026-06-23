"""
ViraEdit — Celery application.

CRITICAL Windows note:
    Celery must run with --pool=solo on Windows because the default
    prefork pool uses os.fork() which is not available on Windows.
    The solo pool runs tasks synchronously in the worker process —
    fine for I/O-bound tasks like Whisper API calls.

Start the worker:
    cd apps/api
    .venv\\Scripts\\celery.exe -A celery_app worker --pool=solo --loglevel=info

Or use the helper script:
    scripts\\worker.bat

Task routing:
    transcribe   → queue: transcription  (ElevenLabs Scribe)
    analyze      → queue: analysis       (Claude AI)
    render       → queue: render         (FFmpeg)
"""
from __future__ import annotations

from pathlib import Path

from celery import Celery
from dotenv import load_dotenv

# Load project .env before Settings (worker cwd is apps/api)
for _candidate in (
    Path(__file__).resolve().parent.parent.parent / ".env",
    Path(__file__).resolve().parent / ".env",
    Path(".env"),
):
    if _candidate.exists():
        load_dotenv(_candidate, override=False)
        break

from config import settings

# ── Application ────────────────────────────────────────────────────────────────

celery_app = Celery(
    "viraedit",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "tasks.transcribe",
        "tasks.analyze",
        "tasks.regenerate",
        "tasks.render_task",           # EP-1.5: FFmpeg render queue
        "tasks.style_extract_task",    # EP-2.8: Style transfer AI queue
    ],
)

# ── Configuration ──────────────────────────────────────────────────────────────

celery_app.conf.update(
    # Serialization — JSON is safe across Python versions
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Timezone — Nepal Standard Time (UTC+5:45)
    timezone="Asia/Kathmandu",
    enable_utc=True,

    # Task result TTL — keep results 24h for polling
    result_expires=86400,

    # Retry config — sensible defaults for API-heavy tasks
    task_max_retries=3,
    task_default_retry_delay=30,  # seconds

    # CRITICAL: Windows requires solo pool (no fork)
    # Pass --pool=solo on the command line; this sets the default
    worker_pool="solo",

    # Concurrency 1 for solo pool (the default when pool=solo)
    worker_concurrency=1,

    # Acks late — task won't be marked done until it finishes
    # Prevents lost tasks if the worker crashes mid-flight
    task_acks_late=True,
    task_reject_on_worker_lost=True,

    # Report STARTED/PROGRESS so the UI can poll real status (not stuck on PENDING)
    task_track_started=True,

    # Route tasks to named queues
    task_routes={
        "tasks.transcribe.*":          {"queue": "transcription"},
        "tasks.analyze.*":             {"queue": "analysis"},
        "tasks.regenerate.*":          {"queue": "analysis"},
        "tasks.render_task.*":         {"queue": "render"},
        "render_video":                {"queue": "render"},
        "tasks.style_extract_task.*":  {"queue": "ai"},
        "style_extract":               {"queue": "ai"},
    },

    # Default queue for unrouted tasks
    task_default_queue="default",
)

# ── Queues (4 specialised + 1 default) ────────────────────────────────────────
# transcription — ElevenLabs Scribe (I/O-bound)
# analysis      — Claude AI scene/editorial analysis (I/O-bound, slow)
# render        — FFmpeg encode jobs (CPU-bound, very slow)
# ai            — Style extraction, image generation (CPU+network)
# default       — Everything else

from kombu import Queue  # noqa: E402

celery_app.conf.task_queues = (
    Queue("default"),
    Queue("transcription"),
    Queue("analysis"),
    Queue("render"),
    Queue("ai"),
)
