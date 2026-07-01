"""
ViraEdit — Style Transfer router (EP-2.8 / T-2.8.4–T-2.8.6).

Style transfer endpoints:
  POST /projects/{id}/style-extract   → extract StyleDNA from URL, save as preset
  GET  /projects/{id}/style-library   → list all saved style presets (from Brand.style_dna)
  POST /projects/{id}/style-apply     → apply a saved preset to the active timeline
  DELETE /projects/{id}/style-library/{preset_id} → delete a saved preset

Design:
  - Style extraction is CPU/network-bound; it runs as a Celery task.
    The endpoint queues it and returns a task_id for polling via /tasks/{id}.
  - Style application is synchronous (pure function) — creates new timeline version.
  - Brand.style_dna["presets"] stores the style library as a list of StylePreset dicts.
  - All endpoints require project ownership (verified via current_user.id).
"""
from __future__ import annotations

import uuid
import pathlib
import tempfile
from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Body, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from dependencies import CurrentUser, DbDep
from exceptions import ProjectNotFoundError
from models import Asset, Brand, MediaType, Project, Timeline, Transcript
from schemas.timeline import TimelineDataModel

router = APIRouter(prefix="/api/v1/projects", tags=["style"])
log = structlog.get_logger("viraedit.styles")


async def _load_project_transcript_words(
    project_id: uuid.UUID,
    db: DbDep,
) -> list[dict[str, Any]] | None:
    """Word timestamps for jump-cut silence trim (user's video, not reference)."""
    asset_result = await db.execute(
        select(Asset)
        .where(
            Asset.project_id == project_id,
            Asset.media_type == MediaType.VIDEO,
        )
        .order_by(Asset.created_at.desc())
        .limit(3)
    )
    for asset in asset_result.scalars().all():
        tr_result = await db.execute(
            select(Transcript).where(Transcript.asset_id == asset.id)
        )
        transcript = tr_result.scalar_one_or_none()
        if transcript and transcript.words:
            return list(transcript.words)
    return None


# ── Request / Response schemas ────────────────────────────────────────────────

class StyleExtractRequest(BaseModel):
    """Body for POST /style-extract — request style extraction from a URL."""
    source_url: str = Field(..., min_length=10, max_length=2048, description="Public video URL")
    preset_name: str = Field(default="", max_length=255, description="Name for the saved preset")
    components: list[str] = Field(
        default_factory=lambda: [
            "pacing", "color", "captions", "transitions", "audio",
            "hook", "visuals", "broll", "vision",
        ],
        description="Which style components to extract (vision = OCR + layout detection)",
    )


class StyleApplyRequest(BaseModel):
    """Body for POST /style-apply — apply a saved style to the active timeline."""
    preset_id: str = Field(..., min_length=1, description="ID of the saved preset")
    components: list[str] = Field(
        default_factory=list,
        description="Subset of preset components to apply (empty = all stored components)",
    )
    strength: float = Field(
        default=1.0, ge=0.0, le=1.0,
        description="Style strength: 0.0 = no change, 1.0 = full match",
    )
    label: str = Field(
        default="", max_length=255, description="Optional timeline version label"
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_project_or_404(project_id: uuid.UUID, user_id: uuid.UUID, db) -> "Project":
    """Fetch a project owned by the user; raise 404 if not found."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user_id,
        )
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise ProjectNotFoundError()
    return project


async def _get_or_create_brand(user_id: uuid.UUID, db) -> "Brand":
    """Return the user's Brand row, creating it if absent."""
    result = await db.execute(
        select(Brand).where(Brand.user_id == user_id)
    )
    brand = result.scalar_one_or_none()
    if brand is None:
        brand = Brand(user_id=user_id, name="My Brand", style_dna={"presets": []})
        db.add(brand)
        await db.flush()
    return brand


# ── POST /style-extract ───────────────────────────────────────────────────────

@router.post(
    "/{project_id}/style-extract",
    summary="Extract editing style from a reference video URL",
    status_code=status.HTTP_202_ACCEPTED,
)
async def extract_style(
    project_id: uuid.UUID,
    body: StyleExtractRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Queue a style extraction task for the given URL.

    The task:
    1. Downloads the video at 480p via yt-dlp
    2. Extracts pacing, color, captions, transitions, audio, hook, visuals, broll
    3. Saves the result as a named preset in the user's Brand.style_dna
    4. Deletes the downloaded file

    Returns a task_id to poll at GET /tasks/{task_id}.
    Supported URLs: YouTube, TikTok, Instagram, Twitter/X, direct MP4.
    """
    await _get_project_or_404(project_id, current_user.id, db)
    await _get_or_create_brand(current_user.id, db)
    await db.commit()

    from tasks.style_transfer.downloader import VideoDownloader
    downloader = VideoDownloader()
    source_url = downloader.normalize_url(body.source_url)
    platform = downloader.detect_platform(source_url)
    if platform is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Invalid video URL. Paste a full link (e.g. https://youtube.com/watch?v=…, "
                "TikTok, Instagram Reels, Facebook, or a direct .mp4 URL)."
            ),
        )

    # Template name: user override → video title → platform fallback
    preset_name = (body.preset_name or "").strip()
    video_title = downloader.fetch_video_title(source_url)
    if not preset_name and video_title:
        preset_name = video_title[:200]
    if not preset_name:
        preset_name = f"Style from {platform.replace('_', ' ').title()}"
    try:
        from tasks.style_extract_task import extract_style_task
        task = extract_style_task.delay(
            user_id=str(current_user.id),
            source_url=source_url,
            components=body.components,
            preset_name=preset_name,
        )
        task_id = task.id
    except Exception as exc:
        log.warning("style_extract_task_queue_failed", error=str(exc))
        # Celery not running — return a pending status the client can poll
        task_id = f"offline-{uuid.uuid4()}"

    log.info(
        "style_extract_queued",
        project_id=str(project_id),
        platform=platform,
        task_id=task_id,
    )
    return {
        "task_id": task_id,
        "status": "queued",
        "platform": platform,
        "preset_name": preset_name,
        "components": body.components,
        "message": (
            "Style extraction started. This usually takes under 30 seconds. "
            "Poll GET /tasks/{task_id} for progress."
        ),
    }


# ── POST /style-extract-upload ────────────────────────────────────────────────

ALLOWED_UPLOAD_TYPES = {
    "video/mp4", "video/quicktime", "video/webm", "video/x-matroska",
    "video/avi", "application/octet-stream",
}
MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB


@router.post(
    "/{project_id}/style-extract-upload",
    summary="Extract editing style from an uploaded reference video",
    status_code=status.HTTP_202_ACCEPTED,
)
async def extract_style_upload(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    preset_name: str = Form(""),
) -> dict:
    """
    Upload a local MP4/MOV/WebM file and queue vision-backed style extraction.
    The file is deleted after analysis completes.
    """
    await _get_project_or_404(project_id, current_user.id, db)
    await _get_or_create_brand(current_user.id, db)
    await db.commit()

    content_type = (file.content_type or "").lower()
    filename = file.filename or "reference.mp4"
    if content_type and content_type not in ALLOWED_UPLOAD_TYPES:
        if not any(filename.lower().endswith(ext) for ext in (".mp4", ".mov", ".webm", ".mkv")):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Upload a video file (MP4, MOV, or WebM).",
            )

    from tasks.style_transfer.downloader import VideoDownloader

    downloader = VideoDownloader()
    file_id = str(uuid.uuid4())[:8]
    ext = pathlib.Path(filename).suffix or ".mp4"
    dest = downloader.temp_dir / f"style_upload_{file_id}{ext}"

    size = 0
    try:
        with dest.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    dest.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Video file is too large. Use a clip under 500 MB.",
                    )
                out.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save uploaded file: {exc}",
        )

    name = preset_name.strip() or f"Style from {pathlib.Path(filename).stem}"
    source_url = f"upload://{filename}"
    components = [
        "pacing", "color", "captions", "transitions", "audio",
        "hook", "visuals", "broll", "vision",
    ]

    try:
        from tasks.style_extract_task import extract_style_task
        task = extract_style_task.delay(
            user_id=str(current_user.id),
            source_url=source_url,
            components=components,
            preset_name=name,
            source_path=str(dest),
        )
        task_id = task.id
    except Exception as exc:
        dest.unlink(missing_ok=True)
        log.warning("style_extract_upload_queue_failed", error=str(exc))
        task_id = f"offline-{uuid.uuid4()}"

    log.info(
        "style_extract_upload_queued",
        project_id=str(project_id),
        filename=filename,
        task_id=task_id,
    )
    return {
        "task_id": task_id,
        "status": "queued",
        "platform": "upload",
        "preset_name": name,
        "components": components,
        "message": (
            "Vision analysis started on your uploaded video. "
            "Poll GET /tasks/{task_id} for progress."
        ),
    }


def _build_toolbox_payload(brand_dna: dict[str, Any] | None) -> dict[str, Any]:
    """Core edit-element catalog — always includes all supported tools."""
    from tasks.style_transfer.edit_toolbox import ToolCategory, discover_all_tool_ids, list_all_tools
    from tasks.style_transfer.models import load_presets
    from tasks.style_transfer.toolbox_store import discovered_tool_ids, preset_ids_by_tool

    template_discovered: set[str] = set(discovered_tool_ids(brand_dna))
    preset_map = dict(preset_ids_by_tool(brand_dna))
    for preset in load_presets(brand_dna):
        for tid in discover_all_tool_ids(
            recipe=preset.edit_recipe,
            effect_ids=[e.get("id") for e in preset.effect_inventory if isinstance(e, dict)],
        ):
            template_discovered.add(tid)
            preset_map.setdefault(tid, [])
            if preset.id not in preset_map[tid]:
                preset_map[tid].append(preset.id)

    tools = list_all_tools(template_discovered, preset_map)
    by_category: dict[str, list[dict]] = {}
    for tool in tools:
        cat = str(tool.get("category", "overlays"))
        by_category.setdefault(cat, []).append(tool)

    available_count = sum(1 for t in tools if t.get("available"))
    return {
        "tool_count": len(tools),
        "available_count": available_count,
        "discovered_count": available_count,
        "template_tool_count": len(template_discovered),
        "tools": tools,
        "by_category": by_category,
        "categories": [c.value for c in ToolCategory],
    }


# Global catalog — core edit elements (not gated behind extraction)
toolbox_router = APIRouter(prefix="/api/v1", tags=["edit-toolbox"])


@toolbox_router.get(
    "/edit-toolbox",
    summary="Core edit-element catalog (VFX, SFX, transitions, B-roll, …)",
)
async def get_core_edit_toolbox(
    current_user: CurrentUser,
    db: DbDep,
) -> dict:
    result = await db.execute(select(Brand).where(Brand.user_id == current_user.id))
    brand = result.scalar_one_or_none()
    return _build_toolbox_payload(brand.style_dna if brand else None)


# ── GET /style-toolbox (project alias — same catalog) ─────────────────────────

@router.get(
    "/{project_id}/style-toolbox",
    summary="Edit toolbox catalog for this project (alias of /edit-toolbox)",
)
async def get_style_toolbox(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    await _get_project_or_404(project_id, current_user.id, db)
    result = await db.execute(select(Brand).where(Brand.user_id == current_user.id))
    brand = result.scalar_one_or_none()
    return _build_toolbox_payload(brand.style_dna if brand else None)


# ── GET /style-library ────────────────────────────────────────────────────────

@router.get(
    "/{project_id}/style-library",
    summary="List all saved style presets",
)
async def list_style_library(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Return all saved style presets for the current user.
    Presets are stored in Brand.style_dna["presets"].
    """
    await _get_project_or_404(project_id, current_user.id, db)

    result = await db.execute(
        select(Brand).where(Brand.user_id == current_user.id)
    )
    brand = result.scalar_one_or_none()

    from tasks.style_transfer.models import load_presets
    presets = load_presets(brand.style_dna if brand else None)

    return {
        "preset_count": len(presets),
        "presets": [p.to_summary_dict() for p in presets],
    }


@router.get(
    "/{project_id}/style-library/{preset_id}",
    summary="Get a single saved style preset with gap report",
)
async def get_style_preset(
    project_id: uuid.UUID,
    preset_id: str,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """Return one preset including coverage_pct and structured gap_report."""
    await _get_project_or_404(project_id, current_user.id, db)

    result = await db.execute(
        select(Brand).where(Brand.user_id == current_user.id)
    )
    brand = result.scalar_one_or_none()

    from tasks.style_transfer.models import load_presets
    presets = load_presets(brand.style_dna if brand else None)
    preset = next((p for p in presets if p.id == preset_id), None)
    if preset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Style preset not found.",
        )

    summary = preset.to_summary_dict()
    summary["gap_report"] = preset.gap_report or {}
    summary["coverage_pct"] = preset.supported_coverage_pct
    summary["effect_inventory"] = preset.effect_inventory
    return summary


@router.get(
    "/{project_id}/style-library/{preset_id}/forensic",
    summary="Forensic reverse-engineering report for a style preset",
)
async def get_style_forensic_report(
    project_id: uuid.UUID,
    preset_id: str,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """Returns the 12-section forensic analysis + draggable tool IDs for a preset."""
    await _get_project_or_404(project_id, current_user.id, db)

    result = await db.execute(
        select(Brand).where(Brand.user_id == current_user.id)
    )
    brand = result.scalar_one_or_none()

    from tasks.style_transfer.models import load_presets
    presets = load_presets(brand.style_dna if brand else None)
    preset = next((p for p in presets if p.id == preset_id), None)
    if preset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Style preset not found.",
        )
    if not preset.forensic_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No forensic report for this preset. Re-extract the reference video.",
        )

    return {
        "preset_id": preset.id,
        "preset_name": preset.name,
        "forensic_report": preset.forensic_report,
    }


# ── POST /style-apply ─────────────────────────────────────────────────────────

@router.post(
    "/{project_id}/style-apply",
    summary="Apply a saved style preset to the project timeline",
)
async def apply_style(
    project_id: uuid.UUID,
    body: StyleApplyRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Apply a saved style preset to the active timeline.

    Creates a new timeline version (undo-safe).
    Only the requested components (or all preset components if empty) are applied.
    Strength 1.0 = fully match the reference style; 0.5 = 50% influence.
    """
    await _get_project_or_404(project_id, current_user.id, db)

    # Load preset from Brand
    result = await db.execute(
        select(Brand).where(Brand.user_id == current_user.id)
    )
    brand = result.scalar_one_or_none()
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No style library found. Extract a style first.",
        )

    from tasks.style_transfer.models import load_presets
    presets = load_presets(brand.style_dna)
    preset = next((p for p in presets if p.id == body.preset_id), None)
    if preset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Style preset '{body.preset_id}' not found in your library.",
        )
    if preset.dna is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This preset has no extracted style data. Try re-extracting it.",
        )

    # Load the current active timeline
    tl_result = await db.execute(
        select(Timeline)
        .where(
            Timeline.project_id == project_id,
            Timeline.is_active.is_(True),
        )
        .order_by(Timeline.version.desc())
        .limit(1)
    )
    current_tl = tl_result.scalar_one_or_none()

    if current_tl is None:
        current_data = TimelineDataModel.empty().model_dump()
    else:
        current_data = current_tl.data or TimelineDataModel.empty().model_dump()

    # Apply edit recipe (preferred) or legacy component applicator
    use_recipe = bool(preset.edit_recipe and preset.edit_recipe.get("events"))
    components_applied: list[str] = []
    if use_recipe:
        from tasks.style_transfer.edit_recipe import EditRecipe
        from tasks.style_transfer.recipe_applicator import RecipeApplicator

        recipe = EditRecipe.from_dict(preset.edit_recipe)
        transcript_words = await _load_project_transcript_words(project_id, db)
        applicator = RecipeApplicator()
        new_data = applicator.apply(
            timeline_data=current_data,
            recipe=recipe,
            dna=preset.dna,
            strength=body.strength,
            preset_name=preset.name,
            preset_id=preset.id,
            transcript_words=transcript_words,
        )
        components_applied = ["edit_recipe"]
    else:
        components_applied = body.components if body.components else preset.components
        if not components_applied:
            components_applied = [
                "color", "captions", "transitions", "audio", "hook", "visuals",
            ]
        from tasks.style_transfer.applicator import StyleApplicator
        applicator = StyleApplicator()
        new_data = applicator.apply(
            timeline_data=current_data,
            dna=preset.dna,
            components=components_applied,
            strength=body.strength,
        )

    # Validate the result against Pydantic schema
    try:
        TimelineDataModel(**new_data)
    except Exception as validation_exc:
        log.warning(
            "style_apply_validation_failed",
            error=str(validation_exc),
            preset_id=body.preset_id,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Style produced an invalid timeline: {validation_exc}",
        )

    # Deactivate the current timeline version
    if current_tl is not None:
        current_tl.is_active = False

    # Save as new timeline version
    new_version = (current_tl.version + 1) if current_tl else 1
    version_name = body.label or f"Style: {preset.name} ({int(body.strength * 100)}%)"
    new_tl = Timeline(
        project_id=project_id,
        name=version_name,
        version=new_version,
        is_active=True,
        data=new_data,
        parent_id=current_tl.id if current_tl else None,
    )
    db.add(new_tl)
    await db.commit()
    await db.refresh(new_tl)

    log.info(
        "style_applied",
        project_id=str(project_id),
        preset_id=body.preset_id,
        preset_name=preset.name,
        components=components_applied,
        strength=body.strength,
        new_version=new_version,
    )
    apply_summary = (
        (new_data.get("metadata") or {})
        .get("edit_template", {})
        .get("apply_summary")
    )
    return {
        "timeline_id": str(new_tl.id),
        "version": new_tl.version,
        "label": new_tl.name,
        "preset_name": preset.name,
        "components_applied": components_applied,
        "strength": body.strength,
        "can_undo": True,
        "apply_summary": apply_summary,
        "message": (
            f"Style '{preset.name}' applied at {int(body.strength * 100)}% strength. "
            "Press Ctrl+Z to undo."
        ),
    }


# ── DELETE /style-library/{preset_id} ────────────────────────────────────────

@router.delete(
    "/{project_id}/style-library/{preset_id}",
    summary="Delete a saved style preset",
    status_code=status.HTTP_200_OK,
)
async def delete_style_preset(
    project_id: uuid.UUID,
    preset_id: str,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Remove a style preset from the user's library.
    Does not affect any timelines that already have the style applied.
    """
    await _get_project_or_404(project_id, current_user.id, db)

    result = await db.execute(
        select(Brand).where(Brand.user_id == current_user.id)
    )
    brand = result.scalar_one_or_none()
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No style library found.",
        )

    from tasks.style_transfer.models import delete_preset
    updated_dna, was_found = delete_preset(brand.style_dna, preset_id)
    if not was_found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Style preset '{preset_id}' not found.",
        )

    brand.style_dna = updated_dna
    await db.commit()

    log.info(
        "style_preset_deleted",
        project_id=str(project_id),
        preset_id=preset_id,
    )
    return {"deleted": True, "preset_id": preset_id}
