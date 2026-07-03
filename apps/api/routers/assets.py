"""
ViraEdit — Assets router.

Upload flow (browser-direct, no file touches the API server):
    1. POST /projects/{id}/assets
       Body: {filename, mime_type, file_size}
       Returns: {asset_id, upload_url, storage_key, expires_in}

    2. Browser PUTs file to upload_url (direct to MinIO)

    3. POST /projects/{id}/assets/{asset_id}/confirm
       Returns: updated Asset with status=uploaded

Other endpoints:
    GET    /projects/{id}/assets              → list assets
    GET    /projects/{id}/assets/{asset_id}   → get asset
    DELETE /projects/{id}/assets/{asset_id}   → delete asset + MinIO object
    GET    /projects/{id}/assets/{asset_id}/download-url → get pre-signed download URL
"""
from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, select

from dependencies import CurrentUser, DbDep
from exceptions import AssetNotFoundError, ProjectNotFoundError, StorageError
from models import Asset, Project, Transcript
from models.asset import AssetStatus, MediaType, ProxyStatus
from schemas.assets import (
    AssetConfirmRequest,
    AssetCreateRequest,
    AssetResponse,
    DownloadURLResponse,
    UploadURLResponse,
)
from schemas.pipeline import AnalyzeRequest, RegenerateRequest, RetranscribeRequest
from services.asset_media import playback_storage_key, should_generate_proxy, source_storage_key
from services.pipeline_cost import (
    CONFIRM_CHAPTERS,
    CONFIRM_SCOPED_REGENERATE,
    CONFIRM_SHORTS,
    CONFIRM_TRANSCRIPTION,
    estimate_scoped_regeneration_cost_usd,
    confirmation_matches,
    estimate_chapters_analysis_cost_usd,
    estimate_remaining_stt_cost_usd,
    estimate_shorts_regeneration_cost_usd,
    estimate_stt_cost_usd,
)
from storage import (
    BUCKET_MEDIA,
    UPLOAD_URL_EXPIRES_SECONDS,
    StorageService,
    get_storage,
    make_storage_key,
    validate_file,
)

router = APIRouter(prefix="/api/v1/projects", tags=["assets"])
log = structlog.get_logger("viraedit.assets")

from fastapi import Depends

StorageDep = Depends(get_storage)


# ── POST /projects/{id}/assets ────────────────────────────────────────────────

@router.post(
    "/{project_id}/assets",
    response_model=UploadURLResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an asset and get a pre-signed upload URL",
)
async def create_asset(
    project_id: uuid.UUID,
    body: AssetCreateRequest,
    db: DbDep,
    current_user: CurrentUser,
    storage: StorageService = StorageDep,
) -> UploadURLResponse:
    """
    Step 1 of the upload flow.

    Validates the file type and size, creates an Asset record in the database
    with status=uploading, and returns a pre-signed MinIO PUT URL.

    The client uploads the file directly to the URL using HTTP PUT.
    No data passes through this API server.
    """
    # Verify project ownership
    project = await _get_owned_project(project_id, current_user.id, db)

    # Validate file type and size — raises UnsupportedFileTypeError or FileTooLargeError
    canonical_mime = validate_file(
        filename=body.filename,
        mime_type=body.mime_type,
        file_size=body.file_size,
    )

    # Determine media type (video vs audio)
    media_type = MediaType.VIDEO if canonical_mime.startswith("video/") else MediaType.AUDIO

    # Generate a new asset ID now so we can use it in the storage key
    asset_id = uuid.uuid4()
    storage_key = make_storage_key(str(project_id), str(asset_id), body.filename)

    # Create Asset record with status=UPLOADING
    asset = Asset(
        id=asset_id,
        project_id=project_id,
        name=body.filename,  # user can rename later
        original_filename=body.filename,
        storage_key=storage_key,
        file_size=body.file_size,
        media_type=media_type,
        mime_type=canonical_mime,
        status=AssetStatus.UPLOADING,
    )
    db.add(asset)
    await db.commit()

    # Generate pre-signed PUT URL for MinIO
    upload_url = await storage.generate_upload_url(
        storage_key=storage_key,
        mime_type=canonical_mime,
        file_size=body.file_size,
        expires_in=UPLOAD_URL_EXPIRES_SECONDS,
        bucket=BUCKET_MEDIA,
    )

    log.info(
        "asset_created",
        asset_id=str(asset_id),
        project_id=str(project_id),
        media_type=media_type.value,
        filename=body.filename,
    )

    return UploadURLResponse(
        asset_id=asset_id,
        upload_url=upload_url,
        storage_key=storage_key,
        expires_in=UPLOAD_URL_EXPIRES_SECONDS,
        method="PUT",
    )


# ── POST /projects/{id}/assets/{asset_id}/confirm ─────────────────────────────

@router.post(
    "/{project_id}/assets/{asset_id}/confirm",
    response_model=AssetResponse,
    summary="Confirm upload completed",
)
async def confirm_asset_upload(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    body: AssetConfirmRequest,
    db: DbDep,
    current_user: CurrentUser,
    storage: StorageService = StorageDep,
) -> AssetResponse:
    """
    Step 3 of the upload flow — call this after the browser PUT completes.

    Verifies the file actually exists in MinIO, updates the asset's status
    to 'uploaded', and returns the updated asset record.

    After this, the transcription Celery task will be queued (EP-2.1).
    """
    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)

    if asset.status not in (AssetStatus.UPLOADING, AssetStatus.ERROR):
        # Already confirmed — idempotent response
        return AssetResponse.model_validate(asset)

    # Verify the object actually landed in MinIO
    exists = await storage.object_exists(asset.storage_key, bucket=BUCKET_MEDIA)
    if not exists:
        log.warning(
            "asset_confirm_object_missing",
            asset_id=str(asset_id),
            storage_key=asset.storage_key,
        )
        asset.status = AssetStatus.ERROR
        asset.error_message = (
            "We couldn't verify your upload arrived. "
            "Please try uploading again."
        )
        await db.commit()
        await db.refresh(asset)
        return AssetResponse.model_validate(asset)

    # Get actual file size from MinIO (overrides client-reported value)
    actual_size = await storage.get_object_size(asset.storage_key, bucket=BUCKET_MEDIA)
    if actual_size:
        asset.file_size = actual_size
    elif body.file_size:
        asset.file_size = body.file_size

    asset.status = AssetStatus.UPLOADED
    asset.error_message = None
    if should_generate_proxy(asset):
        asset.proxy_status = ProxyStatus.PENDING

    await db.commit()
    await db.refresh(asset)

    log.info(
        "asset_upload_confirmed",
        asset_id=str(asset_id),
        file_size=asset.file_size,
    )

    # Queue edit proxy (parallel) — smaller file for editor playback; original kept for export
    if should_generate_proxy(asset):
        try:
            from tasks.proxy_tasks import queue_edit_proxy

            queue_edit_proxy(str(asset_id))
            log.info("edit_proxy_queued", asset_id=str(asset_id))
        except Exception as exc:
            log.warning(
                "edit_proxy_queue_failed",
                asset_id=str(asset_id),
                error=str(exc),
            )

    # Queue transcription Celery task (EP-2.1)
    # Runs asynchronously — client polls asset status until status="analyzing" or "ready"
    try:
        from celery_app import celery_app as _celery
        _celery.send_task(
            "tasks.transcribe.run",
            kwargs={"asset_id": str(asset_id)},
            queue="transcription",
        )
        log.info("transcription_queued", asset_id=str(asset_id))
    except Exception as exc:
        # Redis/Celery unavailable — log but don't fail the confirm response
        log.warning(
            "transcription_queue_failed",
            asset_id=str(asset_id),
            error=str(exc),
            hint="Start the Celery worker: scripts\\worker.bat",
        )

    return AssetResponse.model_validate(asset)


# ── GET /projects/{id}/assets ─────────────────────────────────────────────────

@router.get(
    "/{project_id}/assets",
    response_model=list[AssetResponse],
    summary="List assets in a project",
)
async def list_assets(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> list[AssetResponse]:
    """Return all assets in a project, newest first."""
    await _get_owned_project(project_id, current_user.id, db)

    result = await db.execute(
        select(Asset)
        .where(Asset.project_id == project_id)
        .order_by(Asset.created_at.desc())
    )
    assets = result.scalars().all()
    return [AssetResponse.model_validate(a) for a in assets]


# ── GET /projects/{id}/assets/{asset_id} ──────────────────────────────────────

@router.get(
    "/{project_id}/assets/{asset_id}",
    response_model=AssetResponse,
    summary="Get an asset",
)
async def get_asset(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> AssetResponse:
    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)
    return AssetResponse.model_validate(asset)


# ── GET /projects/{id}/assets/{asset_id}/download-url ────────────────────────

@router.get(
    "/{project_id}/assets/{asset_id}/download-url",
    response_model=DownloadURLResponse,
    summary="Get a pre-signed download URL",
)
async def get_download_url(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    storage: StorageService = StorageDep,
    variant: str = Query(
        default="edit",
        description="edit = lightweight proxy when ready; source = full-quality original",
    ),
) -> DownloadURLResponse:
    """
    Generate a time-limited download URL for an asset.
    Valid for 1 hour. Call again to get a fresh URL.

    Use variant=edit for editor preview (540p proxy when ready).
    Use variant=source for export pipelines (always original).
    """
    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)

    if asset.status == AssetStatus.UPLOADING:
        raise StorageError(
            "This file hasn't finished uploading yet. Please wait a moment."
        )

    normalized = (variant or "edit").lower().strip()
    if normalized not in ("edit", "source"):
        raise HTTPException(
            status_code=422,
            detail="Invalid variant. Use 'edit' or 'source'.",
        )

    if normalized == "source":
        key = source_storage_key(asset)
        using_proxy = False
    else:
        key = playback_storage_key(asset)
        using_proxy = key != asset.storage_key

    url = await storage.generate_download_url(
        storage_key=key,
        bucket=BUCKET_MEDIA,
        filename=asset.original_filename if not using_proxy else f"proxy_{asset.original_filename}",
    )
    return DownloadURLResponse(
        download_url=url,
        expires_in=3600,
        variant=normalized,
        using_proxy=using_proxy,
    )


# ── DELETE /projects/{id}/assets/{asset_id} ───────────────────────────────────

@router.delete(
    "/{project_id}/assets/{asset_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an asset",
    response_model=None,
)
async def delete_asset(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    storage: StorageService = StorageDep,
) -> None:
    """
    Delete an asset record and its file in MinIO.
    This is permanent — there is no undo.
    """
    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)
    storage_key = asset.storage_key
    proxy_key = asset.proxy_storage_key

    # Delete DB record first (cascade removes transcript, scenes, suggestions)
    await db.delete(asset)
    await db.commit()

    # Then delete from MinIO (best-effort — don't fail the request if MinIO is slow)
    await storage.delete_object(storage_key, bucket=BUCKET_MEDIA)
    if proxy_key:
        await storage.delete_object(proxy_key, bucket=BUCKET_MEDIA)

    log.info("asset_deleted", asset_id=str(asset_id), project_id=str(project_id))


# ── GET /projects/{id}/assets/{asset_id}/transcript ──────────────────────────

@router.get(
    "/{project_id}/assets/{asset_id}/transcript",
    summary="Get the transcript for an asset",
)
async def get_transcript(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Return the full transcript with word-level timestamps.

    The transcript is available once the asset status reaches 'analyzing' or 'ready'.
    Poll GET /assets/{asset_id} to check status before calling this endpoint.
    """
    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)

    result = await db.execute(
        select(Transcript).where(Transcript.asset_id == asset_id)
    )
    transcript = result.scalar_one_or_none()

    if transcript is None:
        if asset.status in ("uploading", "uploaded"):
            return {
                "status": "pending",
                "message": "Transcription has not started yet. "
                           "Confirm the upload to begin transcription.",
            }
        elif asset.status == "transcribing":
            return {
                "status": "processing",
                "message": "Transcription is in progress. This usually takes 1–3 minutes.",
            }
        else:
            return {
                "status": "unavailable",
                "message": "No transcript found for this asset.",
            }

    return {
        "status": "ready",
        "transcript_id": str(transcript.id),
        "full_text": transcript.full_text,
        "language": transcript.language,
        "words": transcript.words or [],
        "speakers": transcript.speakers or [],
        "filler_words": transcript.filler_words or [],
        "quality_metrics": transcript.quality_metrics or {},
        "model_used": transcript.model_used,
    }


# ── GET /projects/{id}/assets/{asset_id}/pipeline-costs ──────────────────────

@router.get(
    "/{project_id}/assets/{asset_id}/pipeline-costs",
    summary="Estimated costs and regeneration state for this asset",
)
async def get_pipeline_costs(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """Return what pipeline steps exist and what each regeneration would cost."""
    from models import Scene, Suggestion

    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)
    duration = float(asset.duration_seconds or 0.0)

    tr = await db.execute(select(Transcript).where(Transcript.asset_id == asset_id))
    transcript = tr.scalar_one_or_none()

    full_text = (transcript.full_text or "").strip() if transcript else ""
    transcript_ready = bool(full_text)
    transcript_partial = False
    completed_chunks = 0
    total_chunks = 0
    if transcript and transcript.quality_metrics:
        stt = (transcript.quality_metrics or {}).get("stt_progress") or {}
        completed_chunks = int(stt.get("completed_chunks") or 0)
        total_chunks = int(stt.get("total_chunks") or 0)
        transcript_partial = (
            completed_chunks > 0
            and total_chunks > 0
            and completed_chunks < total_chunks
            and not stt.get("complete")
        )

    scene_count = await db.scalar(
        select(func.count()).select_from(Scene).where(Scene.asset_id == asset_id),
    )
    short_count = await db.scalar(
        select(func.count()).select_from(Suggestion).where(
            Suggestion.asset_id == asset_id,
            Suggestion.type == "SHORT_CLIP",
        )
    )

    stt_full_cost = estimate_stt_cost_usd(duration)
    stt_resume_cost = estimate_remaining_stt_cost_usd(
        duration, completed_chunks, total_chunks
    )

    from services.asset_cost_summary import build_asset_spend_summary

    transcript_cost = float(transcript.cost_usd or 0.0) if transcript else 0.0
    spend = await build_asset_spend_summary(
        db,
        project_id,
        asset_id,
        transcript_cost_usd=transcript_cost,
    )

    return {
        "asset_id": str(asset_id),
        "duration_seconds": duration,
        "transcript": {
            "exists": transcript is not None,
            "ready": transcript_ready,
            "partial": transcript_partial,
            "completed_chunks": completed_chunks,
            "total_chunks": total_chunks,
        },
        "chapters": {
            "exists": (scene_count or 0) > 0,
            "count": scene_count or 0,
        },
        "shorts": {
            "exists": (short_count or 0) > 0,
            "count": short_count or 0,
        },
        "costs_usd": {
            "transcription_full": stt_full_cost,
            "transcription_resume": stt_resume_cost,
            "chapters_analysis": estimate_chapters_analysis_cost_usd(duration),
            "shorts_regeneration": estimate_shorts_regeneration_cost_usd(),
        },
        "confirmations": {
            "transcription": CONFIRM_TRANSCRIPTION,
            "chapters": CONFIRM_CHAPTERS,
            "shorts": CONFIRM_SHORTS,
        },
        "spend": spend,
    }


# ── POST /projects/{id}/assets/{asset_id}/retranscribe ───────────────────────

@router.post(
    "/{project_id}/assets/{asset_id}/retranscribe",
    summary="Regenerate or resume transcript (ElevenLabs Scribe)",
    status_code=status.HTTP_202_ACCEPTED,
)
async def retranscribe_asset(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    body: RetranscribeRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
  Re-run or resume ElevenLabs transcription.

  - Partial run: resumes from the last completed audio chunk (no confirmation).
  - Full replace: requires typing ``Regenerate`` and shows ElevenLabs cost estimate.
    """
    from models import Scene, Suggestion

    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)

    if asset.status == AssetStatus.UPLOADING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Wait until the upload is confirmed before regenerating the transcript.",
        )

    tr = await db.execute(select(Transcript).where(Transcript.asset_id == asset_id))
    transcript = tr.scalar_one_or_none()
    duration = float(asset.duration_seconds or 0.0)
    full_text = (transcript.full_text or "").strip() if transcript else ""

    transcript_partial = False
    if transcript and transcript.quality_metrics:
        stt = (transcript.quality_metrics or {}).get("stt_progress") or {}
        done = int(stt.get("completed_chunks") or 0)
        total = int(stt.get("total_chunks") or 0)
        transcript_partial = done > 0 and total > 0 and done < total

    resume_cost_usd = 0.0
    if transcript_partial and transcript and transcript.quality_metrics:
        stt = (transcript.quality_metrics or {}).get("stt_progress") or {}
        resume_cost_usd = estimate_remaining_stt_cost_usd(
            duration,
            int(stt.get("completed_chunks") or 0),
            int(stt.get("total_chunks") or 1),
        )

    force_full = False
    if full_text and not transcript_partial:
        if not body.confirmation or not confirmation_matches(
            body.confirmation, CONFIRM_TRANSCRIPTION
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": (
                        'A transcript already exists. Type "Regenerate" to replace it. '
                        "This clears chapters and shorts."
                    ),
                    "requires_confirmation": True,
                    "confirmation_phrase": CONFIRM_TRANSCRIPTION,
                    "estimated_cost_usd": estimate_stt_cost_usd(duration),
                    "estimated_cost_label": (
                        f"~${estimate_stt_cost_usd(duration):.2f} ElevenLabs Scribe "
                        f"({duration:.0f}s audio)"
                    ),
                },
            )
        force_full = True
        await db.execute(delete(Scene).where(Scene.asset_id == asset_id))
        await db.execute(
            delete(Suggestion).where(Suggestion.asset_id == asset_id),
        )
        await db.execute(delete(Transcript).where(Transcript.asset_id == asset_id))

    elif transcript_partial and body.resume:
        force_full = False
    elif not full_text:
        force_full = False
    else:
        force_full = bool(body.confirmation)

    try:
        from celery_app import celery_app as _celery
        _celery.send_task(
            "tasks.transcribe.run",
            kwargs={"asset_id": str(asset_id), "force": force_full},
            queue="transcription",
        )
        task_queued = True
    except Exception as exc:
        log.warning("retranscribe_queue_failed", asset_id=str(asset_id), error=str(exc))
        task_queued = False

    asset.status = AssetStatus.TRANSCRIBING
    asset.error_message = None
    await db.commit()

    log.info(
        "retranscribe_queued",
        asset_id=str(asset_id),
        project_id=str(project_id),
        force=force_full,
        resume=transcript_partial and body.resume,
    )

    if transcript_partial and body.resume and not force_full:
        msg = (
            "Resuming transcription from the last completed chunk. "
            f"Estimated cost ~${resume_cost_usd:.2f}."
        )
    else:
        msg = (
            "Transcript regeneration started. This usually takes 1–3 minutes."
            if task_queued
            else "Could not queue transcription. Start the Celery worker (scripts\\worker.bat all)."
        )

    return {
        "status": "queued" if task_queued else "pending_worker",
        "asset_id": str(asset_id),
        "force": force_full,
        "message": msg,
    }


# ── GET /projects/{id}/assets/{asset_id}/scenes ───────────────────────────────

@router.get(
    "/{project_id}/assets/{asset_id}/scenes",
    summary="Get AI-detected scenes with viral scores",
)
async def get_scenes(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Return all scenes detected by Claude AI analysis.

    Each scene has a viral score for YouTube, Shorts, TikTok, and Instagram.
    Scenes with is_highlight=true are the strongest clips for Shorts extraction.

    Available once asset status = 'ready'.
    """
    from models import Scene
    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)

    if asset.status not in ("analyzing", "ready"):
        return {
            "status": asset.status,
            "message": _status_message(asset.status),
            "scenes": [],
        }

    result = await db.execute(
        select(Scene)
        .where(Scene.asset_id == asset_id, Scene.scene_kind == "chapter")
        .order_by(Scene.index)
    )
    scenes = result.scalars().all()
    if not scenes:
        result = await db.execute(
            select(Scene)
            .where(Scene.asset_id == asset_id)
            .order_by(Scene.index)
        )
        scenes = result.scalars().all()

    return {
        "status": "ready" if asset.status == "ready" else "processing",
        "scene_count": len(scenes),
        "scenes": [
            {
                "id": str(s.id),
                "index": s.index,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "duration": round(s.end_time - s.start_time, 2),
                "title": s.title,
                "summary": s.summary,
                "topics": s.topics or [],
                "emotion": s.emotion,
                "energy_level": s.energy_level,
                "transcript_excerpt": s.transcript_excerpt,
                "is_highlight": s.is_highlight,
                "highlight_score": s.highlight_score,
                "retention_score": s.retention_score,
                "platform_scores": s.platform_scores or {},
                "thumbnail_url": s.thumbnail_url,
                "scene_kind": s.scene_kind,
                "title_reason": (s.platform_scores or {}).get("chapter_title_reason"),
            }
            for s in scenes
        ],
    }


# ── GET /projects/{id}/assets/{asset_id}/suggestions ─────────────────────────

@router.get(
    "/{project_id}/assets/{asset_id}/suggestions",
    summary="Get AI editing suggestions",
)
async def get_suggestions(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Return Claude's editing suggestions for this asset.

    Suggestions are ordered by impact. Each has an action dict that the
    timeline engine can apply automatically when the user clicks "Accept".
    """
    from models import Suggestion
    await _get_owned_asset(project_id, asset_id, current_user.id, db)

    result = await db.execute(
        select(Suggestion)
        .where(Suggestion.asset_id == asset_id)
        .order_by(Suggestion.confidence.desc())
    )
    suggestions = result.scalars().all()

    return {
        "suggestion_count": len(suggestions),
        "suggestions": [
            {
                "id": str(s.id),
                "type": s.type.value if hasattr(s.type, "value") else str(s.type),
                "title": s.title,
                "description": s.description,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "action": s.action or {},
                "confidence": s.confidence,
                "status": s.status.value if hasattr(s.status, "value") else str(s.status),
            }
            for s in suggestions
        ],
    }


# ── POST /projects/{id}/assets/{asset_id}/analyze ────────────────────────────

@router.post(
    "/{project_id}/assets/{asset_id}/analyze",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Run or regenerate chapter detection and/or shorts",
)
async def trigger_analysis(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    body: AnalyzeRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Queue chapter detection (OpenAI) and/or shorts extraction.

    - First run: no confirmation phrase required.
    - Regenerate: type ``regenerate chapters`` or ``regenerate shorts``; cost estimate returned if missing.
    """
    from models import Scene, Suggestion

    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)
    scope = (body.scope or "chapters").strip().lower()
    if scope not in ("chapters", "shorts", "all"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='scope must be "chapters", "shorts", or "all"',
        )

    scene_count_pre = await db.scalar(
        select(func.count()).select_from(Scene).where(Scene.asset_id == asset_id),
    )
    short_count_pre = await db.scalar(
        select(func.count()).select_from(Suggestion).where(
            Suggestion.asset_id == asset_id,
            Suggestion.type == "SHORT_CLIP",
        ),
    )
    if (
        scope == "all"
        and (scene_count_pre or 0) > 0
        and (short_count_pre or 0) > 0
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Chapters and shorts both exist. Regenerate them separately "
                '(scope "chapters" or "shorts") so each cost confirmation is clear.'
            ),
        )

    if asset.status == AssetStatus.TRANSCRIBING:
        return {
            "status": "pending",
            "message": "Transcription is still in progress. Run this after the transcript is ready.",
        }

    tr = await db.execute(select(Transcript).where(Transcript.asset_id == asset_id))
    transcript = tr.scalar_one_or_none()
    if not transcript or not (transcript.full_text or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A transcript is required before chapter or shorts analysis.",
        )

    duration = float(asset.duration_seconds or 0.0)

    scene_count = await db.scalar(
        select(func.count()).select_from(Scene).where(Scene.asset_id == asset_id),
    )
    short_count = await db.scalar(
        select(func.count()).select_from(Suggestion).where(
            Suggestion.asset_id == asset_id,
            Suggestion.type == "SHORT_CLIP",
        ),
    )

    if scope in ("chapters", "all") and (scene_count or 0) > 0:
        if not body.confirmation or not confirmation_matches(
            body.confirmation, CONFIRM_CHAPTERS
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": (
                        'Chapters already exist. Type "regenerate chapters" to replace them.'
                    ),
                    "requires_confirmation": True,
                    "confirmation_phrase": CONFIRM_CHAPTERS,
                    "estimated_cost_usd": estimate_chapters_analysis_cost_usd(duration),
                    "estimated_cost_label": (
                        f"~${estimate_chapters_analysis_cost_usd(duration):.2f} OpenAI "
                        "(chapter detection + edit suggestions)"
                    ),
                },
            )
        await db.execute(delete(Scene).where(Scene.asset_id == asset_id))
        await db.execute(
            delete(Suggestion).where(
                Suggestion.asset_id == asset_id,
                Suggestion.type != "SHORT_CLIP",
            ),
        )

    if scope in ("shorts", "all") and (short_count or 0) > 0:
        if not body.confirmation or not confirmation_matches(
            body.confirmation, CONFIRM_SHORTS
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": (
                        'Shorts already exist. Type "regenerate shorts" to replace them.'
                    ),
                    "requires_confirmation": True,
                    "confirmation_phrase": CONFIRM_SHORTS,
                    "estimated_cost_usd": estimate_shorts_regeneration_cost_usd(),
                    "estimated_cost_label": "Free (rule-based shorts engine, no API cost)",
                },
            )
        await db.execute(
            delete(Suggestion).where(
                Suggestion.asset_id == asset_id,
                Suggestion.type == "SHORT_CLIP",
            ),
        )

    if scope == "shorts" and (scene_count or 0) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Generate chapters first — shorts are derived from chapter boundaries.",
        )

    asset.status = AssetStatus.ANALYZING
    asset.error_message = None
    await db.commit()

    try:
        from celery_app import celery_app as _celery
        _celery.send_task(
            "tasks.analyze.run",
            kwargs={"asset_id": str(asset_id), "scope": scope},
            queue="analysis",
        )
        log.info("analysis_retriggered", asset_id=str(asset_id), scope=scope)
        task_queued = True
    except Exception as exc:
        log.warning("analysis_queue_failed", asset_id=str(asset_id), error=str(exc))
        task_queued = False

    label = {
        "chapters": "Chapter detection",
        "shorts": "Shorts extraction",
        "all": "Full analysis",
    }[scope]

    return {
        "status": "queued" if task_queued else "pending_worker",
        "scope": scope,
        "message": (
            f"{label} queued. This uses OpenAI for chapters, not ElevenLabs."
            if task_queued
            else "Could not queue analysis. Start the Celery worker (scripts\\worker.bat all)."
        ),
        "asset_id": str(asset_id),
    }


# ── GET /projects/{id}/assets/{asset_id}/highlights ───────────────────────────

@router.get(
    "/{project_id}/assets/{asset_id}/highlights",
    summary="Get promo highlight clips with platform packs",
)
async def get_highlights(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    from models import Highlight

    await _get_owned_asset(project_id, asset_id, current_user.id, db)
    result = await db.execute(
        select(Highlight)
        .where(
            Highlight.asset_id == asset_id,
            Highlight.superseded.is_(False),
        )
        .order_by(Highlight.highlight_score.desc())
    )
    rows = result.scalars().all()
    return {
        "highlight_count": len(rows),
        "highlights": [
            {
                "id": str(h.id),
                "start_time": h.start_time,
                "end_time": h.end_time,
                "duration": round(h.end_time - h.start_time, 2),
                "title": h.title,
                "summary": h.summary,
                "promo_copy_en": h.promo_copy_en,
                "promo_caption_ne": h.promo_caption_ne,
                "highlight_score": h.highlight_score,
                "platform_packs": h.platform_packs or [],
                "thumbnail_url": h.thumbnail_url,
                "status": h.status,
            }
            for h in rows
        ],
    }


# ── POST /projects/{id}/assets/{asset_id}/regenerate ──────────────────────────

@router.post(
    "/{project_id}/assets/{asset_id}/regenerate",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Regenerate chapters, shorts, or highlights with a user prompt",
)
async def regenerate_scoped(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    body: RegenerateRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)
    scope = (body.scope or "shorts").strip().lower()
    allowed = {"chapters", "shorts", "highlights", "suggestions", "master_edit"}
    if scope not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'scope must be one of: {", ".join(sorted(allowed))}',
        )

    duration = float(asset.duration_seconds or 0.0)
    if not body.confirmation or not confirmation_matches(
        body.confirmation, CONFIRM_SCOPED_REGENERATE
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": 'Type "regenerate" to replace existing results for this scope.',
                "requires_confirmation": True,
                "confirmation_phrase": CONFIRM_SCOPED_REGENERATE,
                "estimated_cost_usd": estimate_scoped_regeneration_cost_usd(
                    scope, duration
                ),
                "estimated_cost_label": (
                    f"~${estimate_scoped_regeneration_cost_usd(scope, duration):.2f} "
                    f"({scope} regeneration)"
                ),
            },
        )

    asset.status = AssetStatus.ANALYZING
    await db.commit()

    try:
        from celery_app import celery_app as _celery

        _celery.send_task(
            "tasks.regenerate.run",
            kwargs={
                "asset_id": str(asset_id),
                "scope": scope,
                "user_prompt": body.user_prompt or "",
                "reject_ids": body.reject_ids or [],
            },
            queue="analysis",
        )
        task_queued = True
    except Exception as exc:
        log.warning("regenerate_queue_failed", error=str(exc))
        task_queued = False

    return {
        "status": "queued" if task_queued else "pending_worker",
        "scope": scope,
        "asset_id": str(asset_id),
        "message": (
            f"Regenerating {scope} with your prompt."
            if task_queued
            else "Could not queue regeneration. Start the Celery worker."
        ),
    }


# ── POST /projects/{id}/assets/{asset_id}/hooks ───────────────────────────────

@router.post(
    "/{project_id}/assets/{asset_id}/hooks",
    status_code=status.HTTP_200_OK,
    summary="Generate 5 alternative Nepali hooks for the video opening",
)
async def generate_hooks(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Generate 5 alternative hook rewrites for the video opening using AI.

    Returns hooks in BOTH Nepali (Devanagari) AND English instruction/rationale
    for each. The best hook is flagged automatically.

    Default model: Groq Llama 3.3 70B (~$0.001 per call).
    Only available once asset status = 'ready' (after AI analysis completes).
    """
    from models import Scene, Transcript
    from tasks.hooks import generate_hook_alternatives, pick_best_hook

    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)

    if asset.status != "ready":
        return {
            "status": asset.status,
            "message": _status_message(asset.status),
            "hooks": [],
        }

    # Get the first scene (opening) for topic context
    scenes_result = await db.execute(
        select(Scene)
        .where(Scene.asset_id == asset_id)
        .order_by(Scene.index)
        .limit(3)
    )
    scenes = scenes_result.scalars().all()

    # Build topic string from first 3 scenes
    topic = " / ".join(s.title or "" for s in scenes if s.title)[:300] or "Nepali video content"

    # Get opening transcript text
    transcript_result = await db.execute(
        select(Transcript).where(Transcript.asset_id == asset_id)
    )
    transcript = transcript_result.scalar_one_or_none()
    current_opening = ""
    if transcript and transcript.full_text:
        # First 400 chars of transcript = opening section
        current_opening = transcript.full_text[:400]

    # Best moment from highest-scoring highlight scene
    highlight_scene = next(
        (s for s in sorted(scenes, key=lambda x: x.highlight_score or 0, reverse=True)),
        None,
    )
    best_moment = highlight_scene.summary if highlight_scene else "engaging moment in the video"

    duration = asset.duration_seconds or 0.0

    try:
        import asyncio
        hooks = await asyncio.to_thread(
            generate_hook_alternatives,
            topic=topic,
            current_opening=current_opening,
            best_moment_description=best_moment,
            duration=float(duration),
        )
        best = pick_best_hook(hooks)

        log.info("hooks_generated", asset_id=str(asset_id), count=len(hooks))

        return {
            "status": "ready",
            "hook_count": len(hooks),
            "best_hook": best,
            "hooks": hooks,
        }
    except Exception as exc:
        log.error("hook_generation_failed", asset_id=str(asset_id), error=str(exc))
        return {
            "status": "error",
            "message": "Hook generation failed. Please try again.",
            "hooks": [],
        }


# ── GET /projects/{id}/assets/{asset_id}/shorts ──────────────────────────────

@router.get(
    "/{project_id}/assets/{asset_id}/shorts",
    summary="Get short-clip candidates with platform scores and Nepali hooks",
)
async def get_shorts(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Return short-clip candidates (15–60 s) extracted from scene analysis.

    Each candidate includes:
    - Platform scores for YouTube, Facebook, TikTok, Instagram, LinkedIn
    - Nepal-weighted overall score (Facebook ranks higher than Western markets)
    - 5 Nepali hook template options (Devanagari text, zero LLM cost)
    - 9:16 reframe instructions for vertical video (TikTok / Reels)

    Shorts are pre-generated during AI analysis (step 12 of the pipeline)
    and stored as suggestions with type='short_clip'.
    Only available once asset status = 'ready'.
    """
    from models import Suggestion

    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)

    if asset.status != "ready":
        return {
            "status": asset.status,
            "message": _status_message(asset.status),
            "short_count": 0,
            "shorts": [],
        }

    result = await db.execute(
        select(Suggestion)
        .where(
            Suggestion.asset_id == asset_id,
            Suggestion.type == "SHORT_CLIP",
        )
        .order_by(Suggestion.confidence.desc())
    )
    short_suggestions = result.scalars().all()

    shorts = []
    for s in short_suggestions:
        action = s.action or {}
        start_t = s.start_time if s.start_time is not None else action.get("start_time")
        end_t = s.end_time if s.end_time is not None else action.get("end_time")
        shorts.append({
            "id": str(s.id),
            "title": s.title,
            "description": s.description,
            "start_time": start_t,
            "end_time": end_t,
            "duration": action.get("duration"),
            "action": action,
            "nepal_weighted_score": action.get("nepal_weighted_score"),
            "platform_scores": action.get("platform_scores", {}),
            "platform_ranking": action.get("platform_ranking", []),
            "best_platform": action.get("best_platform"),
            "nepali_hooks": action.get("nepali_hooks", []),
            "reframe": action.get("reframe", {}),
            "viral_score": action.get("viral_score"),
            "dominant_intent": action.get("dominant_intent"),
            "scene_indices": action.get("scene_indices", []),
            "confidence": s.confidence,
            "status": s.status.value if hasattr(s.status, "value") else str(s.status),
        })

    return {
        "status": "ready",
        "short_count": len(shorts),
        "shorts": shorts,
    }


# ── POST /projects/{id}/assets/{asset_id}/short-clips/render ─────────────────

from pydantic import BaseModel, Field as PydanticField


class ShortClipRenderRequest(BaseModel):
    """Export a time range from the source asset as a vertical short."""
    start_time: float = PydanticField(..., ge=0.0)
    end_time: float = PydanticField(..., gt=0.0)
    platform: str = "youtube_shorts"
    name: str = PydanticField(default="", max_length=255)
    pan_x: float = PydanticField(default=0.5, ge=0.0, le=1.0)
    reframe_strategy: str | None = None
    short_styling: dict | None = None
    segments: list[dict] | None = None


@router.post(
    "/{project_id}/assets/{asset_id}/short-clips/render",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Export a short clip (trimmed segment) from the source video",
)
async def render_short_clip(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    body: ShortClipRenderRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Queue FFmpeg render for a segment of the uploaded asset.

    Shorts in the editor are suggestion records — this endpoint exports by
    start/end time without requiring a row in the shorts table.
    Re-export is allowed any number of times.
    """
    from models.render import Render, RenderPlatform, RenderStatus

    if body.end_time <= body.start_time:
        from fastapi import HTTPException
        raise HTTPException(400, "end_time must be greater than start_time.")

    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)

    try:
        platform = RenderPlatform(body.platform)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(400, f"Unsupported platform: {body.platform}")

    timeline = await _ensure_render_timeline(project_id, asset, db)

    platform_resolutions = {
        RenderPlatform.TIKTOK: "1080x1920",
        RenderPlatform.YOUTUBE_SHORTS: "1080x1920",
        RenderPlatform.INSTAGRAM_REELS: "1080x1920",
        RenderPlatform.FACEBOOK: "1280x720",
        RenderPlatform.YOUTUBE: "1920x1080",
    }

    render_name = body.name or f"Short {body.start_time:.0f}s–{body.end_time:.0f}s"
    clip_settings = {
        "is_short": True,
        "asset_id": str(asset_id),
        "start_time": body.start_time,
        "end_time": body.end_time,
        "pan_x": body.pan_x,
        "reframe_strategy": body.reframe_strategy,
        "short_styling": body.short_styling,
        "segments": body.segments,
    }

    render = Render(
        project_id=project_id,
        timeline_id=timeline.id,
        name=render_name,
        platform=platform,
        status=RenderStatus.QUEUED,
        resolution=platform_resolutions.get(platform, "1080x1920"),
        progress_percent=0.0,
        render_settings=clip_settings,
    )
    db.add(render)
    await db.flush()
    await db.commit()
    await db.refresh(render)

    task_id = str(render.id) + "-offline"
    try:
        from tasks.render_task import render_video
        task = render_video.apply_async(
            kwargs={
                "render_id": str(render.id),
                "project_id": str(project_id),
                "platform": platform.value,
            },
            queue="render",
        )
        task_id = task.id
        render.celery_task_id = task_id
        await db.commit()
        await db.refresh(render)
    except Exception as exc:
        log.warning("short_clip_render_queue_failed", error=str(exc))

    log.info(
        "short_clip_render_queued",
        project_id=str(project_id),
        asset_id=str(asset_id),
        render_id=str(render.id),
        start=body.start_time,
        end=body.end_time,
    )

    return {
        "render_id": str(render.id),
        "id": str(render.id),
        "platform": platform.value,
        "task_id": task_id,
        "message": "Short export queued. Poll GET /renders/{render_id} for progress.",
    }


# ── GET /projects/{id}/assets/{asset_id}/visuals ─────────────────────────────

@router.get(
    "/{project_id}/assets/{asset_id}/visuals",
    summary="Get visual opportunity suggestions (statistics, lists, CTAs, key terms)",
)
async def get_visuals(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Return visual overlay suggestions extracted from the Nepali transcript.

    Each suggestion identifies a moment where an animated graphic would improve
    comprehension or engagement. Types include:

    - **statistic** — percentage, ratio, measurement → animated_number_graphic
    - **large_number** — Nepali scale numbers (लाख, करोड) → large_number_card
    - **list_item** — enumeration point (पहिलो, दोस्रो…) → list_card_animation
    - **comparison** — before/after, X vs Y → split_screen_broll
    - **cta** — subscribe/like/share → animated_cta_overlay
    - **key_term** — repeated proper noun / tech term → lower_third_text

    Visuals are pre-generated during AI analysis (step 13 of the pipeline)
    and stored as suggestions with type='visual_opportunity'.
    Zero LLM cost — purely rule-based Devanagari + Arabic regex detection.
    Only available once asset status = 'ready'.
    """
    from models import Suggestion

    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)

    if asset.status != "ready":
        return {
            "status": asset.status,
            "message": _status_message(asset.status),
            "visual_count": 0,
            "visuals": [],
        }

    result = await db.execute(
        select(Suggestion)
        .where(
            Suggestion.asset_id == asset_id,
            Suggestion.type == "VISUAL_OPPORTUNITY",
        )
        .order_by(Suggestion.start_time.asc())
    )
    visual_suggestions = result.scalars().all()

    visuals = []
    for s in visual_suggestions:
        action = s.action or {}
        visuals.append({
            "id": str(s.id),
            "title": s.title,
            "description": s.description,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "visual_type": action.get("visual_type"),
            "display_value": action.get("display_value"),
            "suggested_visual": action.get("suggested_visual"),
            "nepali_label": action.get("nepali_label"),
            "duration_seconds": action.get("duration_seconds"),
            "text_excerpt": action.get("text_excerpt"),
            "confidence": s.confidence,
            "status": s.status.value if hasattr(s.status, "value") else str(s.status),
        })

    return {
        "status": "ready",
        "visual_count": len(visuals),
        "visuals": visuals,
    }


# ── GET /projects/{id}/assets/{asset_id}/broll-suggestions ──────────────────

@router.get(
    "/{project_id}/assets/{asset_id}/broll-suggestions",
    summary="Get AI B-roll suggestions (transcript-based, LLM-powered)",
)
async def get_broll_suggestions(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Return AI-generated B-roll suggestions for the video.

    B-roll suggestions are generated during AI analysis (step 13.5 of the
    pipeline) using GPT-4o-mini to scan the transcript. Each suggestion
    identifies a moment where B-roll footage would enhance the video.

    Only available once asset status = 'ready'.
    """
    from models import Suggestion

    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)

    if asset.status != "ready":
        return {
            "status": asset.status,
            "message": _status_message(asset.status),
            "broll_count": 0,
            "broll_suggestions": [],
        }

    result = await db.execute(
        select(Suggestion)
        .where(
            Suggestion.asset_id == asset_id,
            Suggestion.type == "VISUAL_OPPORTUNITY",
        )
        .order_by(Suggestion.start_time.asc())
    )
    all_visuals = result.scalars().all()
    # Filter in Python for ai_broll suggestions
    broll_suggestions = [
        s for s in all_visuals
        if (s.action or {}).get("suggested_visual") == "ai_broll"
    ]

    suggestions = []
    for s in broll_suggestions:
        action = s.action or {}
        suggestions.append({
            "id": str(s.id),
            "title": s.title,
            "description": s.description,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "confidence": s.confidence,
            "status": s.status.value if hasattr(s.status, "value") else str(s.status),
            "broll_prompt": action.get("broll_prompt", ""),
            "broll_reason": action.get("broll_reason", ""),
            "generation_status": action.get("generation_status", "pending"),
            "text_excerpt": action.get("text_excerpt", ""),
            "generated_asset_url": action.get("generated_asset_url"),
            "generated_asset_id": action.get("generated_asset_id"),
            "error_message": action.get("error_message"),
        })

    return {
        "status": "ready",
        "broll_count": len(suggestions),
        "broll_suggestions": suggestions,
    }


# ── POST /projects/{id}/assets/{asset_id}/prompt ────────────────────────────

@router.post(
    "/{project_id}/assets/{asset_id}/prompt",
    status_code=status.HTTP_200_OK,
    summary="Compile a natural-language editing prompt into operations",
)
async def compile_editing_prompt(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    body: dict,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Accept a natural-language editing prompt (Nepali, English, or Romanized Nepali)
    and return concrete editing operations ready for the timeline engine.

    Examples:
    - "viral बनाउनुस्"     → hook rewrite + extract shorts + add captions
    - "caption थप्नुस्"    → generate Nepali captions
    - "छिटो बनाउनुस्"     → remove fillers + trim silences
    - "make it viral"     → same as Nepali viral command
    - "viral banaunus"    → Romanized Nepali, same result

    Zero LLM cost — purely rule-based pattern matching.
    Returns operations in the same format as AI suggestions.
    """
    from models import Scene, Transcript
    from tasks.prompt_compiler import compile_prompt

    prompt = body.get("prompt", "").strip()
    if not prompt:
        return {
            "error": "prompt is required",
            "operations": [],
        }

    asset = await _get_owned_asset(project_id, asset_id, current_user.id, db)

    # Build context from asset state
    transcript_result = await db.execute(
        select(Transcript).where(Transcript.asset_id == asset_id)
    )
    transcript = transcript_result.scalar_one_or_none()

    scene_count_result = await db.execute(
        select(Scene).where(Scene.asset_id == asset_id).limit(1)
    )
    has_scenes = scene_count_result.scalar_one_or_none() is not None

    context = {
        "has_transcript": transcript is not None and bool(transcript.full_text),
        "has_scenes": has_scenes,
        "asset_status": asset.status if hasattr(asset.status, "__str__") else str(asset.status),
        "duration_seconds": float(asset.duration_seconds or 0.0),
    }

    result = compile_prompt(prompt, context)

    log.info(
        "prompt_compiled",
        asset_id=str(asset_id),
        action=result.intent.action,
        confidence=result.intent.confidence,
        op_count=len(result.operations),
        language=result.intent.language,
    )

    return {
        "prompt": prompt,
        "intent": {
            "action": result.intent.action,
            "target": result.intent.target,
            "intensity": result.intent.intensity,
            "language": result.intent.language,
            "confidence": result.intent.confidence,
        },
        "operations": [
            {
                "operation": op.operation,
                "params": op.params,
                "description": op.description,
                "applies_to": op.applies_to,
                "estimated_impact": op.estimated_impact,
                "requires": op.requires,
            }
            for op in result.operations
        ],
        "summary": result.summary,
        "is_valid": result.is_valid,
        "validation_errors": result.validation_errors,
        "warnings": result.warnings,
        "operation_count": len(result.operations),
    }


def _status_message(status: str) -> str:
    """Return a user-friendly status message for non-ready assets."""
    messages = {
        "uploading": "Upload is still in progress.",
        "uploaded": "File uploaded. Transcription will begin shortly.",
        "transcribing": "Transcription is in progress (1–3 minutes).",
        "analyzing": "AI analysis is running. Scenes will appear shortly.",
        "error": "Processing encountered an error. Try re-analyzing.",
    }
    return messages.get(status, f"Status: {status}")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _minimal_timeline_data_for_asset(asset: Asset) -> dict:
    """Build a single-clip timeline JSON for render jobs when none is saved yet."""
    duration = float(asset.duration_seconds or 300.0)
    clip_id = str(uuid.uuid4())
    return {
        "schema_version": 1,
        "tracks": [{
            "id": "track-video-1",
            "type": "video",
            "name": "Main Video",
            "muted": False,
            "locked": False,
            "visible": True,
            "clips": [{
                "id": clip_id,
                "asset_id": str(asset.id),
                "source_start": 0.0,
                "source_end": duration,
                "timeline_start": 0.0,
                "timeline_end": duration,
                "speed": 1.0,
                "muted": False,
                "volume": 1.0,
                "effects": [],
                "label": asset.original_filename or "",
            }],
        }],
        "global_settings": {
            "resolution": "1920x1080",
            "fps": 30.0,
            "audio_sample_rate": 48000,
            "duration": duration,
        },
        "metadata": {"auto_created_for": "short_export"},
    }


async def _ensure_render_timeline(project_id: uuid.UUID, asset: Asset, db) -> "Timeline":
    """
    Return a timeline row for linking render jobs.

    Short-clip export trims the source asset directly and does not need editor
    timeline data, but Render.timeline_id is required. We reuse the active
    timeline when present, reactivate the latest version if needed, or create
    a minimal single-clip timeline automatically.
    """
    from models import Timeline

    active = await db.execute(
        select(Timeline)
        .where(
            Timeline.project_id == project_id,
            Timeline.is_active.is_(True),
        )
        .order_by(Timeline.version.desc())
        .limit(1)
    )
    timeline = active.scalar_one_or_none()
    if timeline is not None:
        return timeline

    latest = await db.execute(
        select(Timeline)
        .where(Timeline.project_id == project_id)
        .order_by(Timeline.version.desc())
        .limit(1)
    )
    timeline = latest.scalar_one_or_none()
    if timeline is not None:
        timeline.is_active = True
        db.add(timeline)
        await db.flush()
        log.info(
            "timeline_reactivated_for_render",
            project_id=str(project_id),
            timeline_id=str(timeline.id),
        )
        return timeline

    timeline = Timeline(
        project_id=project_id,
        name="Auto-created for export",
        version=1,
        data=_minimal_timeline_data_for_asset(asset),
        parent_id=None,
        is_active=True,
    )
    db.add(timeline)
    await db.flush()
    log.info(
        "timeline_auto_created_for_render",
        project_id=str(project_id),
        asset_id=str(asset.id),
        timeline_id=str(timeline.id),
    )
    return timeline


async def _get_owned_project(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    db,
) -> Project:
    """Load a project and verify ownership — returns 404 for both missing and foreign projects."""
    from sqlalchemy import select as _select
    result = await db.execute(_select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None or project.user_id != user_id:
        raise ProjectNotFoundError(project_id=str(project_id))
    return project


async def _get_owned_asset(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    user_id: uuid.UUID,
    db,
) -> Asset:
    """Load an asset, verify it belongs to the project, and verify project ownership."""
    await _get_owned_project(project_id, user_id, db)

    from sqlalchemy import select as _select
    result = await db.execute(
        _select(Asset).where(Asset.id == asset_id, Asset.project_id == project_id)
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise AssetNotFoundError(asset_id=str(asset_id))
    return asset
