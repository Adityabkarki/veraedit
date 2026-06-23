"""
ViraEdit — Style Extraction Celery Task (EP-2.8 / T-2.8.6).

Async task that:
1. Downloads the reference video via yt-dlp
2. Runs StyleExtractor in parallel on all components
3. Saves the resulting preset to Brand.style_dna
4. Deletes the downloaded file

Queue: "ai" (shared with analysis tasks)
Retries: 2 max with 30-second delay
Windows: uses --pool=solo

Usage (queued from the router):
    from tasks.style_extract_task import extract_style_task
    task = extract_style_task.delay(
        user_id="...",
        source_url="https://tiktok.com/...",
        components=["captions", "color"],
        preset_name="My TikTok Style",
    )
"""
from __future__ import annotations

import asyncio
import logging
import pathlib
from datetime import datetime, timezone

from celery_app import celery_app

log = logging.getLogger("viraedit.tasks.style_extract")

DEFAULT_BRAND_NAME = "My Brand"


def _style_extract_progress(task, percent: float, stage: str) -> None:
    """Publish PROGRESS meta for GET /tasks/{id} polling."""
    try:
        task.update_state(
            state="PROGRESS",
            meta={
                "progress_percent": round(max(0.0, min(100.0, percent)), 1),
                "stage": stage,
                "message": stage,
            },
        )
    except Exception:
        pass


@celery_app.task(
    bind=True,
    name="style_extract",
    queue="ai",
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
    soft_time_limit=600,   # 10 min — vision + download on reference clips
    time_limit=660,
)
def extract_style_task(
    self,
    user_id: str,
    source_url: str,
    components: list[str],
    preset_name: str,
    source_path: str = "",
) -> dict:
    """
    Download a reference video and extract its editing style.

    Args:
        user_id:     UUID string of the user who requested extraction.
        source_url:  Public video URL (YouTube, TikTok, Instagram, Twitter, MP4).
        components:  List of style components to extract.
        preset_name: Display name for the saved preset.

    Returns:
        Dict with {"status": "complete", "preset_id": "...", "preset_name": "..."} on success.
        Or {"status": "failed", "error": "..."} on non-retryable failure.
    """
    log.info(
        "style_extract_task_start: user=%s url=%s components=%s",
        user_id, source_url, components,
    )
    _style_extract_progress(self, 5, "Queued — starting style extraction…")

    from tasks.style_transfer.downloader import VideoDownloader, VideoDownloadError
    from tasks.style_transfer.extractor import StyleExtractor
    from tasks.style_transfer.models import StylePreset, save_preset

    downloader = VideoDownloader()
    video_path = None
    uploaded_path = pathlib.Path(source_path) if source_path else None

    try:
        if uploaded_path and uploaded_path.is_file():
            video_path = uploaded_path
            effective_url = source_url or f"upload://{uploaded_path.name}"
            _style_extract_progress(self, 15, "Reading uploaded reference video…")
        else:
            _style_extract_progress(self, 10, "Downloading reference video…")
            video_path = downloader.download(source_url)
            effective_url = source_url
            _style_extract_progress(self, 20, "Download complete — detecting scenes…")

        # 2. Extract style (run async event loop in this sync Celery context)
        _style_extract_progress(
            self,
            30,
            "Vision scan (OCR + layouts) — can take 3–5 min on CPU, please wait…",
        )
        extractor = StyleExtractor()
        dna = asyncio.run(
            extractor.extract(
                video_path,
                components=components,
                source_url=effective_url,
            )
        )
        _style_extract_progress(self, 65, "Building edit template and forensic report…")

        # 3. Build the preset with template metadata
        from tasks.style_transfer.fidelity import estimate_extraction_fidelity
        from tasks.style_transfer.gap_analyzer import build_gap_report

        vision = getattr(extractor, "_last_vision", None)
        scenes = extractor._detect_scenes_sync(video_path)
        ref_duration_s = extractor._reference_duration_s(video_path, scenes)

        recipe = extractor.build_edit_recipe(dna, video_path, scenes=scenes, vision=vision)

        recipe_dict = recipe.to_dict()
        if vision:
            recipe_dict["vision"] = vision.to_dict()

        from tasks.style_transfer.edit_toolbox import (
            FORENSIC_DEFAULT_TOOL_IDS,
            discover_all_tool_ids,
        )
        from tasks.style_transfer.forensic_analyzer import (
            build_forensic_report,
            enrich_forensic_with_llm,
        )
        from tasks.style_transfer.gap_analyzer import build_gap_report

        tool_ids = discover_all_tool_ids(
            recipe=recipe_dict,
            vision=vision.to_dict() if vision else None,
        )
        avg_cut_s = dna.pacing.avg_cut_duration_ms / 1000.0
        if avg_cut_s < 2.0 or dna.pacing.cuts_per_minute > 30:
            tool_ids = list(dict.fromkeys(tool_ids + FORENSIC_DEFAULT_TOOL_IDS))

        forensic = build_forensic_report(
            dna,
            scenes,
            ref_duration_s,
            vision=vision,
            preset_name=preset_name,
            tool_ids=tool_ids,
        )
        _style_extract_progress(self, 80, "Enriching forensic analysis (optional AI pass)…")
        forensic = enrich_forensic_with_llm(forensic)
        forensic_dict = forensic.to_dict()

        gap = build_gap_report(
            dna,
            vision_effect_ids=vision.effect_ids if vision else None,
            recipe=recipe_dict,
        )
        gap_tool_ids = list(dict.fromkeys(tool_ids + [e["id"] for e in gap["effect_inventory"] if e.get("id")]))
        fidelity = estimate_extraction_fidelity(dna, gap)

        video_info = downloader.get_last_video_info() if not uploaded_path else {}
        source_title = str(video_info.get("title") or "").strip()
        if uploaded_path and uploaded_path.is_file():
            source_title = source_title or pathlib.Path(uploaded_path.name).stem
        if source_title and (
            not preset_name or preset_name.startswith("Style from")
        ):
            preset_name = source_title[:200]

        preset = StylePreset(
            name=preset_name,
            source_url=effective_url,
            source_title=source_title or preset_name,
            dna=dna,
            components=components,
            is_template=True,
            effect_inventory=gap["effect_inventory"],
            missing_capabilities=gap["missing_capabilities"],
            supported_coverage_pct=gap["supported_coverage_pct"],
            fidelity_score=fidelity,
            edit_recipe=recipe_dict,
            forensic_report=forensic_dict,
            created_at=datetime.now(timezone.utc).isoformat(),
        )

        # 4. Save to Brand.style_dna via a DB connection
        _style_extract_progress(self, 92, "Saving template to your style library…")
        _save_preset_to_brand(user_id, preset)
        _style_extract_progress(self, 100, "Complete")

        log.info(
            "style_extract_task_complete: user=%s preset_id=%s name=%s",
            user_id, preset.id, preset_name,
        )
        return {
            "status": "complete",
            "preset_id": preset.id,
            "preset_name": preset_name,
            "components": components,
        }

    except VideoDownloadError as exc:
        # Non-retryable (private video, unsupported URL, etc.)
        log.warning("style_extract_download_failed: user=%s error=%s", user_id, exc)
        return {"status": "failed", "error": str(exc)}

    except Exception as exc:
        from sqlalchemy.exc import IntegrityError, ProgrammingError

        log.error(
            "style_extract_task_failed: user=%s error=%s",
            user_id, exc, exc_info=True,
        )
        # DB constraint / SQL errors won't succeed on retry
        if isinstance(exc, (IntegrityError, ProgrammingError, VideoDownloadError)):
            return {"status": "failed", "error": str(exc.orig) if hasattr(exc, "orig") else str(exc)}
        # Retry transient failures (network, disk)
        try:
            raise extract_style_task.retry(exc=exc)
        except extract_style_task.MaxRetriesExceededError:
            return {"status": "failed", "error": f"Extraction failed after retries: {exc}"}

    finally:
        if uploaded_path and uploaded_path.is_file():
            try:
                uploaded_path.unlink(missing_ok=True)
            except Exception:
                pass
        elif video_path is not None:
            downloader.delete(video_path)


def _save_preset_to_brand(user_id: str, preset: "StylePreset") -> None:
    """
    Save the extracted preset to Brand.style_dna using a sync DB connection.
    Called from the Celery worker (not async).
    """
    import json
    import uuid as _uuid

    from sqlalchemy import create_engine, text

    from config import settings
    from tasks.style_transfer.models import save_preset
    from tasks.style_transfer.toolbox_store import merge_tools_from_preset

    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    sync_engine = create_engine(sync_url, pool_pre_ping=True)

    with sync_engine.begin() as conn:
        # Get or create Brand row
        result = conn.execute(
            text("SELECT id, style_dna FROM brands WHERE user_id = :uid"),
            {"uid": user_id},
        )
        row = result.fetchone()

        if row is None:
            # Create brand
            new_brand_id = str(_uuid.uuid4())
            new_dna = save_preset({"presets": []}, preset)
            new_dna = merge_tools_from_preset(new_dna, preset.to_dict())
            conn.execute(
                text(
                    "INSERT INTO brands (id, user_id, name, style_dna, created_at, updated_at) "
                    "VALUES (:id, :uid, :name, CAST(:dna AS jsonb), NOW(), NOW())"
                ),
                {
                    "id": new_brand_id,
                    "uid": user_id,
                    "name": DEFAULT_BRAND_NAME,
                    "dna": json.dumps(new_dna),
                },
            )
        else:
            # Update existing brand
            existing_dna = row[1] if row[1] else {}
            updated_dna = save_preset(existing_dna, preset)
            updated_dna = merge_tools_from_preset(updated_dna, preset.to_dict())
            conn.execute(
                text(
                    "UPDATE brands SET style_dna = CAST(:dna AS jsonb), updated_at = NOW() "
                    "WHERE user_id = :uid"
                ),
                {"dna": json.dumps(updated_dna), "uid": user_id},
            )

    sync_engine.dispose()
    log.info("style_preset_saved_to_brand: user=%s preset_id=%s", user_id, preset.id)
