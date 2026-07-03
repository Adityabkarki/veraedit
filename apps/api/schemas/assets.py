"""ViraEdit — Asset request/response schemas."""
from __future__ import annotations

import uuid
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from models.asset import AssetStatus, MediaType, ProxyStatus
from storage import ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES


class AssetCreateRequest(BaseModel):
    """
    Request body for creating an asset record and getting a pre-signed upload URL.

    The client sends file metadata BEFORE uploading — the API validates the
    file type, creates the DB record, and returns a pre-signed URL.
    """
    filename: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Original filename (e.g. 'podcast_ep42.mp4')",
    )
    mime_type: str = Field(
        ...,
        description="MIME type of the file (e.g. 'video/mp4')",
    )
    file_size: Optional[int] = Field(
        None,
        ge=1,
        description="File size in bytes (optional but recommended for validation)",
    )

    @field_validator("mime_type")
    @classmethod
    def mime_type_must_be_allowed(cls, v: str) -> str:
        normalized = v.lower().strip()
        # Accept if mime_type is known or we'll catch it in storage.validate_file
        # (extension-based fallback happens there)
        return normalized

    @field_validator("file_size")
    @classmethod
    def file_size_must_be_reasonable(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v > MAX_FILE_SIZE_BYTES:
            raise ValueError(
                f"File is too large. Maximum size is 10GB "
                f"({MAX_FILE_SIZE_BYTES:,} bytes)."
            )
        return v

    model_config = {"json_schema_extra": {"example": {
        "filename": "podcast_episode_42.mp4",
        "mime_type": "video/mp4",
        "file_size": 524288000,  # ~500 MB
    }}}


class UploadURLResponse(BaseModel):
    """Returned when an asset record is created."""
    asset_id: uuid.UUID = Field(description="Newly created asset ID")
    upload_url: str = Field(description="Pre-signed PUT URL — upload directly to this URL")
    storage_key: str = Field(description="Object key in MinIO (for your records)")
    expires_in: int = Field(description="Upload URL validity in seconds", default=3600)
    method: str = Field(description="HTTP method to use for upload", default="PUT")

    model_config = {"json_schema_extra": {"example": {
        "asset_id": "550e8400-e29b-41d4-a716-446655440000",
        "upload_url": "http://localhost:9000/viraedit-media/projects/...",
        "storage_key": "projects/proj-id/assets/asset-id/podcast.mp4",
        "expires_in": 3600,
        "method": "PUT",
    }}}


class AssetConfirmRequest(BaseModel):
    """Optional body for confirming an upload (adds reported file size)."""
    file_size: Optional[int] = Field(
        None,
        ge=1,
        description="Actual file size in bytes as reported by the client",
    )


class AssetResponse(BaseModel):
    """Full asset details."""
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    original_filename: str
    storage_key: str
    file_size: Optional[int]
    duration_seconds: Optional[float]
    media_type: MediaType
    mime_type: Optional[str]
    status: AssetStatus
    error_message: Optional[str]
    media_metadata: Optional[dict] = None
    proxy_storage_key: Optional[str] = None
    proxy_file_size: Optional[int] = None
    proxy_status: Optional[ProxyStatus] = None

    model_config = {"from_attributes": True}


class DownloadURLResponse(BaseModel):
    """Pre-signed download URL for an asset."""
    download_url: str
    expires_in: int = 3600
    variant: str = Field(description="'edit' (proxy when ready) or 'source' (original)")
    using_proxy: bool = False
