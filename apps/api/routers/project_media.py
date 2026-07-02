"""
ViraEdit — Project-scoped supplementary media items.

GET    /projects/{id}/media       — list all media items in a project
POST   /projects/{id}/media      — upload a new media item
DELETE /projects/{id}/media/{mid} — remove a media item
"""
from __future__ import annotations

import uuid
from pathlib import PurePosixPath

import structlog
from fastapi import APIRouter, HTTPException, UploadFile, status
from sqlalchemy import select

from dependencies import CurrentUser, DbDep, StorageDep
from models import Project, ProjectMedia

router = APIRouter(prefix="/api/v1/projects", tags=["project-media"])
log = structlog.get_logger("viraedit.project_media")

MAX_MEDIA_BYTES = 500 * 1024 * 1024  # 500 MB

ALLOWED_TYPES = {
    "image/jpeg": "image",
    "image/png": "image",
    "image/webp": "image",
    "image/gif": "image",
    "video/mp4": "video",
    "video/webm": "video",
    "audio/mpeg": "audio",
    "audio/wav": "audio",
    "audio/ogg": "audio",
    "audio/mp4": "audio",
}


async def _get_project_or_404(db: DbDep.__args__[0], project_id: uuid.UUID, user_id: uuid.UUID) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@router.get("/{project_id}/media")
async def list_project_media(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    storage: StorageDep,
) -> list[dict]:
    user_id = current_user.id
    await _get_project_or_404(db, project_id, user_id)

    result = await db.execute(
        select(ProjectMedia)
        .where(ProjectMedia.project_id == project_id)
        .order_by(ProjectMedia.created_at.desc())
    )
    items = result.scalars().all()

    out: list[dict] = []
    for item in items:
        url = await storage.generate_download_url(item.storage_key)
        thumb_url = None
        if item.thumb_key:
            thumb_url = await storage.generate_download_url(item.thumb_key)
        out.append({
            "id": str(item.id),
            "name": item.file_name,
            "type": item.media_type,
            "url": url,
            "thumbnailUrl": thumb_url,
            "fileSize": item.file_size_bytes,
        })
    return out


@router.post("/{project_id}/media", status_code=status.HTTP_201_CREATED)
async def upload_project_media(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    storage: StorageDep,
    file: UploadFile,
) -> dict:
    user_id = current_user.id
    await _get_project_or_404(db, project_id, user_id)

    filename = file.filename or "upload.bin"
    mime_type = file.content_type or "application/octet-stream"

    if mime_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {mime_type}",
        )

    content = await file.read()
    if len(content) > MAX_MEDIA_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum size is 500 MB.",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    media_id = uuid.uuid4()
    ext = PurePosixPath(filename).suffix.lower() or ".bin"
    storage_key = f"projects/{project_id}/media/{media_id}{ext}"
    media_type = ALLOWED_TYPES[mime_type]

    await storage.put_object(storage_key, content, mime_type=mime_type)

    item = ProjectMedia(
        id=media_id,
        project_id=project_id,
        user_id=user_id,
        storage_key=storage_key,
        file_name=filename,
        media_type=media_type,
        file_size_bytes=len(content),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    url = await storage.generate_download_url(storage_key)

    log.info(
        "project_media_uploaded",
        media_id=str(media_id),
        project_id=str(project_id),
        media_type=media_type,
        file_name=filename,
    )

    return {
        "id": str(item.id),
        "name": item.file_name,
        "type": item.media_type,
        "url": url,
        "storageKey": item.storage_key,
        "fileSize": item.file_size_bytes,
    }


@router.delete("/{project_id}/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_project_media(
    project_id: uuid.UUID,
    media_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    storage: StorageDep,
) -> None:
    user_id = current_user.id
    await _get_project_or_404(db, project_id, user_id)

    result = await db.execute(
        select(ProjectMedia).where(
            ProjectMedia.id == media_id,
            ProjectMedia.project_id == project_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Media item not found.")

    try:
        await storage.delete_object(item.storage_key)
        if item.thumb_key:
            await storage.delete_object(item.thumb_key)
    except Exception as e:
        log.warning("media_delete_storage_failed", media_id=str(media_id), error=str(e))

    await db.delete(item)
    await db.commit()

    log.info("project_media_deleted", media_id=str(media_id), project_id=str(project_id))
