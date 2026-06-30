"""
ViraEdit — Tagged asset library router (Phase 00).

GET  /api/v1/library         — list current user's tagged library assets
POST /api/v1/library/upload  — upload image/video, auto-tag, store in MinIO
"""
from __future__ import annotations

import tempfile
import uuid
from pathlib import Path, PurePosixPath

import structlog
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import select

from config import settings
from dependencies import CurrentUser, DbDep, StorageDep
from models import LibraryAsset, User
from processors.asset_tagger import (
    _IMAGE_TAG_COST_USD,
    _VIDEO_TAG_COST_USD,
    tag_image_asset,
    tag_video_asset,
)
from services.ai_budget import budget
from schemas.asset_tags import LibraryAssetOut
from storage import (
    make_library_storage_key,
    validate_library_file,
)

router = APIRouter(prefix="/api/v1/library", tags=["asset-library"])
log = structlog.get_logger("viraedit.asset_library")

MAX_LIBRARY_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB for clips/images


def _asset_type_for_mime(mime_type: str) -> str:
    if mime_type.startswith("video/"):
        return "video"
    filename_lower = mime_type.lower()
    if "logo" in filename_lower:
        return "logo"
    return "image"


def _to_out(asset: LibraryAsset, thumb_url: str | None = None) -> LibraryAssetOut:
    return LibraryAssetOut(
        id=str(asset.id),
        storage_key=asset.storage_key,
        thumb_key=asset.thumb_key,
        asset_type=asset.asset_type,  # type: ignore[arg-type]
        source=asset.source,  # type: ignore[arg-type]
        tags=asset.tags,
        thumb_url=thumb_url,
    )


@router.get("", response_model=list[LibraryAssetOut])
async def list_library(
    db: DbDep,
    current_user: CurrentUser,
    storage: StorageDep,
) -> list[LibraryAssetOut]:
    """Return all tagged assets in the current user's library."""
    user: User = current_user  # type: ignore[assignment]
    result = await db.execute(
        select(LibraryAsset)
        .where(LibraryAsset.user_id == user.id)
        .order_by(LibraryAsset.created_at.desc())
    )
    assets = result.scalars().all()
    out: list[LibraryAssetOut] = []
    for asset in assets:
        thumb_url = None
        if asset.thumb_key:
            thumb_url = await storage.generate_download_url(asset.thumb_key)
        out.append(_to_out(asset, thumb_url=thumb_url))
    return out


@router.post("/upload", response_model=LibraryAssetOut, status_code=status.HTTP_201_CREATED)
async def upload_library_asset(
    db: DbDep,
    current_user: CurrentUser,
    storage: StorageDep,
    file: UploadFile = File(...),
) -> LibraryAssetOut:
    """Upload a clip or image to the library and auto-tag it."""
    user: User = current_user  # type: ignore[assignment]
    filename = file.filename or "upload.bin"
    content = await file.read()
    if len(content) > MAX_LIBRARY_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File is too large. Maximum library upload size is 500 MB.",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty.",
        )

    mime_type = validate_library_file(filename, file.content_type or "", len(content))
    asset_id = uuid.uuid4()
    ext = PurePosixPath(filename).suffix.lower() or ".bin"
    storage_key = make_library_storage_key(str(user.id), str(asset_id), f"asset{ext}")
    asset_type = _asset_type_for_mime(mime_type)

    await storage.put_object(storage_key, content, mime_type=mime_type)

    temp_dir = Path(tempfile.gettempdir()) / "viraedit" / "library"
    temp_dir.mkdir(parents=True, exist_ok=True)
    local_path = temp_dir / f"{asset_id}{ext}"
    try:
        local_path.write_bytes(content)
        if asset_type == "video":
            tags = await tag_video_asset(local_path)
            budget.record(
                _VIDEO_TAG_COST_USD,
                action="asset_tagging",
                workspace_id=str(user.id),
                provider="openai",
                model=settings.OPENAI_MODEL_PRIMARY,
            )
        else:
            tags = await tag_image_asset(local_path)
            budget.record(
                _IMAGE_TAG_COST_USD,
                action="asset_tagging",
                workspace_id=str(user.id),
                provider="openai",
                model=settings.OPENAI_MODEL_PRIMARY,
            )
    finally:
        if local_path.exists():
            local_path.unlink()

    asset = LibraryAsset(
        id=asset_id,
        user_id=user.id,
        storage_key=storage_key,
        asset_type=asset_type,
        source="uploaded",
        tags=tags,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)

    log.info(
        "library_asset_uploaded",
        asset_id=str(asset_id),
        user_id=str(user.id),
        asset_type=asset_type,
        shot_type=tags.get("shot_type"),
    )
    return _to_out(asset)
