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
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "tasks.transcribe",
        "tasks.analyze",
        "tasks.regenerate",
        "tasks.render_task",           # EP-1.5: FFmpeg render queue
        "tasks.style_extract_task",    # EP-2.8: Style transfer AI queue
        "tasks.ingest_tasks",          # Module 01: Video ingestion
        "tasks.style_clone_task",      # Module 02: Style cloning
        "tasks.style_tasks",           # Phase 01: Style intelligence
        "tasks.shorts_tasks",          # Phase 03: Platform shorts extraction
        "tasks.chapter_tasks",         # Phase 04: Chapter extraction
        "tasks.sizzle_tasks",          # Phase 05: Sizzle reel generation
        "tasks.render_from_template_task",  # Phase 06: Template render
        "tasks.caption_tasks",         # Module 03: Captions STT + burn-in
        "tasks.cut_tasks",             # Module 04: Text-based cuts
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
    # Linux: prefork allows multiple tasks in parallel, change with --concurrency=N
    worker_pool="prefork",

    # Number of worker processes (prefork pool)
    worker_concurrency=2,

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
        "tasks.ingest.*":              {"queue": "default"},
        "tasks.style_clone.*":       {"queue": "ai"},
        "tasks.style_intelligence.*": {"queue": "ai"},
        "tasks.shorts.*":            {"queue": "render"},
        "tasks.chapters.*":          {"queue": "render"},
        "tasks.sizzle.*":            {"queue": "render"},
        "tasks.render.from_template": {"queue": "render"},
        "tasks.caption.render":      {"queue": "render"},
        "tasks.caption.transcribe":    {"queue": "transcription"},
        "tasks.caption.*":           {"queue": "transcription"},
        "tasks.cut.*":               {"queue": "render"},
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
