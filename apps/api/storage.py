"""
ViraEdit — MinIO/S3 storage service.

Pre-signed URL flow (browser-direct upload — no file passes through the API server):
    1. Client → POST /assets       → API creates Asset record, returns pre-signed PUT URL
    2. Client → PUT <minio_url>    → file uploaded directly to MinIO (no API involved)
    3. Client → POST /assets/confirm → API verifies object exists, sets status=UPLOADED

Buckets:
    viraedit-media   — raw source files (video/audio); private, served via pre-signed URLs
    viraedit-renders — rendered output;               public-read (MP4 downloads)
    viraedit-temp    — temporary processing files;    auto-expiring (7 days)

Storage key pattern: projects/{project_id}/assets/{asset_id}/{filename}
"""
from __future__ import annotations

import asyncio
import mimetypes
import re
import uuid
from pathlib import PurePosixPath
from typing import Optional

import boto3
import structlog
from botocore.config import Config
from botocore.exceptions import ClientError

from config import settings
from exceptions import FileTooLargeError, StorageError, UnsupportedFileTypeError

log = structlog.get_logger("viraedit.storage")

# ── Bucket names ──────────────────────────────────────────────────────────────

BUCKET_MEDIA = "viraedit-media"
BUCKET_RENDERS = "viraedit-renders"
BUCKET_TEMP = "viraedit-temp"

# ── File validation ───────────────────────────────────────────────────────────

# Accepted MIME types and their canonical display names
ALLOWED_MIME_TYPES: dict[str, str] = {
    # Video
    "video/mp4": "MP4",
    "video/quicktime": "MOV",
    "video/x-matroska": "MKV",
    "video/x-msvideo": "AVI",
    "video/webm": "WebM",
    "video/x-ms-wmv": "WMV",
    # Audio
    "audio/mpeg": "MP3",
    "audio/wav": "WAV",
    "audio/x-wav": "WAV",
    "audio/mp4": "M4A",
    "audio/ogg": "OGG",
    "audio/flac": "FLAC",
    "audio/x-flac": "FLAC",
    "audio/aac": "AAC",
}

# Map extensions → MIME types for clients that send wrong MIME types
EXTENSION_MIME_MAP: dict[str, str] = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
    ".wmv": "video/x-ms-wmv",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
}

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 * 1024  # 10 GB
UPLOAD_URL_EXPIRES_SECONDS = 3600  # 1 hour
DOWNLOAD_URL_EXPIRES_SECONDS = 3600  # 1 hour


def validate_file(filename: str, mime_type: str, file_size: Optional[int]) -> str:
    """
    Validate a file for upload. Returns the canonical MIME type.

    Raises:
        UnsupportedFileTypeError: If the file type is not allowed.
        FileTooLargeError:        If the file exceeds the 10GB limit.
    """
    # Size check
    if file_size is not None and file_size > MAX_FILE_SIZE_BYTES:
        raise FileTooLargeError(max_size_gb=10.0)

    # MIME type check — try reported MIME first, then infer from extension
    ext = PurePosixPath(filename).suffix.lower()
    canonical_mime = EXTENSION_MIME_MAP.get(ext) or mime_type.lower()

    if canonical_mime not in ALLOWED_MIME_TYPES:
        allowed_names = ", ".join(sorted(set(ALLOWED_MIME_TYPES.values())))
        raise UnsupportedFileTypeError(mime_type=canonical_mime)

    return canonical_mime


def make_storage_key(project_id: str, asset_id: str, filename: str) -> str:
    """
    Build the MinIO object key for an asset.

    Format: projects/{project_id}/assets/{asset_id}/{safe_filename}

    The filename is sanitised to prevent path traversal and special-character
    issues in pre-signed URLs.
    """
    # Keep only safe characters: alphanumeric, dots, hyphens, underscores
    safe_name = re.sub(r"[^\w.\-]", "_", PurePosixPath(filename).name)
    return f"projects/{project_id}/assets/{asset_id}/{safe_name}"


# ── StorageService ────────────────────────────────────────────────────────────

class StorageService:
    """
    MinIO/S3-compatible object storage abstraction.

    Uses a thread-pool executor for boto3 calls so the async API server is
    never blocked — boto3 is synchronous and has no native asyncio support.

    All methods are async-safe and can be awaited from FastAPI routes.
    """

    def __init__(self) -> None:
        self._client = None

    def _get_client(self):
        """Lazy-initialize the boto3 S3 client."""
        if self._client is None:
            self._client = boto3.client(
                "s3",
                endpoint_url=settings.S3_ENDPOINT_URL,
                aws_access_key_id=settings.S3_ACCESS_KEY_ID,
                aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
                config=Config(
                    signature_version="s3v4",
                    # MinIO pre-signed URLs use path-style addressing
                    s3={"addressing_style": "path"},
                ),
                region_name="us-east-1",  # MinIO ignores this but boto3 requires it
            )
        return self._client

    # ── Pre-signed upload URL ─────────────────────────────────────────────────

    async def generate_upload_url(
        self,
        storage_key: str,
        mime_type: str,
        file_size: Optional[int] = None,
        expires_in: int = UPLOAD_URL_EXPIRES_SECONDS,
        bucket: str = BUCKET_MEDIA,
    ) -> str:
        """
        Generate a pre-signed PUT URL so the browser can upload directly to MinIO.

        Args:
            storage_key: The MinIO object key (from make_storage_key()).
            mime_type:   The expected Content-Type of the upload.
            file_size:   Optional expected file size (for Content-Length constraint).
            expires_in:  URL validity in seconds (default: 1 hour).
            bucket:      Target bucket (default: viraedit-media).

        Returns:
            A pre-signed HTTPS URL valid for `expires_in` seconds.

        Raises:
            StorageError: If the URL cannot be generated.
        """
        def _generate() -> str:
            client = self._get_client()
            params: dict = {
                "Bucket": bucket,
                "Key": storage_key,
                "ContentType": mime_type,
            }
            return client.generate_presigned_url(
                "put_object",
                Params=params,
                ExpiresIn=expires_in,
                HttpMethod="PUT",
            )

        try:
            url = await asyncio.to_thread(_generate)
            log.debug("upload_url_generated", storage_key=storage_key, bucket=bucket)
            return url
        except Exception as exc:
            log.error("upload_url_failed", storage_key=storage_key, error=str(exc))
            raise StorageError("Could not generate upload URL. Please try again.") from exc

    # ── Pre-signed download URL ───────────────────────────────────────────────

    async def generate_download_url(
        self,
        storage_key: str,
        bucket: str = BUCKET_MEDIA,
        expires_in: int = DOWNLOAD_URL_EXPIRES_SECONDS,
        filename: Optional[str] = None,
    ) -> str:
        """
        Generate a pre-signed GET URL so the user can download their file.

        Args:
            storage_key: The MinIO object key.
            bucket:      Source bucket (default: viraedit-media).
            expires_in:  URL validity in seconds (default: 1 hour).
            filename:    Optional download filename for Content-Disposition header.

        Returns:
            A pre-signed HTTPS URL valid for `expires_in` seconds.
        """
        def _generate() -> str:
            client = self._get_client()
            params: dict = {
                "Bucket": bucket,
                "Key": storage_key,
            }
            if filename:
                params["ResponseContentDisposition"] = (
                    f'attachment; filename="{filename}"'
                )
            return client.generate_presigned_url(
                "get_object",
                Params=params,
                ExpiresIn=expires_in,
            )

        try:
            url = await asyncio.to_thread(_generate)
            return url
        except Exception as exc:
            log.error("download_url_failed", storage_key=storage_key, error=str(exc))
            raise StorageError("Could not generate download URL. Please try again.") from exc

    # ── Object existence check ────────────────────────────────────────────────

    async def object_exists(self, storage_key: str, bucket: str = BUCKET_MEDIA) -> bool:
        """
        Return True if the object exists in MinIO. Used to confirm uploads.

        This is a HEAD request — no data is transferred.
        """
        def _check() -> bool:
            client = self._get_client()
            try:
                client.head_object(Bucket=bucket, Key=storage_key)
                return True
            except ClientError as exc:
                if exc.response["Error"]["Code"] in ("404", "NoSuchKey"):
                    return False
                raise  # Re-raise unexpected errors

        try:
            return await asyncio.to_thread(_check)
        except Exception as exc:
            log.error("object_exists_check_failed", storage_key=storage_key, error=str(exc))
            return False

    async def get_object_size(self, storage_key: str, bucket: str = BUCKET_MEDIA) -> Optional[int]:
        """Return object size in bytes from HEAD response, or None if not found."""
        def _head() -> Optional[int]:
            client = self._get_client()
            try:
                resp = client.head_object(Bucket=bucket, Key=storage_key)
                return resp.get("ContentLength")
            except ClientError:
                return None

        try:
            return await asyncio.to_thread(_head)
        except Exception:
            return None

    # ── Object deletion ───────────────────────────────────────────────────────

    async def delete_object(self, storage_key: str, bucket: str = BUCKET_MEDIA) -> None:
        """Delete an object from MinIO. Silently ignores missing objects."""
        def _delete() -> None:
            client = self._get_client()
            try:
                client.delete_object(Bucket=bucket, Key=storage_key)
            except ClientError as exc:
                # Ignore 404 — already deleted
                if exc.response["Error"]["Code"] not in ("404", "NoSuchKey"):
                    raise

        try:
            await asyncio.to_thread(_delete)
            log.info("object_deleted", storage_key=storage_key, bucket=bucket)
        except Exception as exc:
            log.warning("object_delete_failed", storage_key=storage_key, error=str(exc))

    async def delete_prefix(self, prefix: str, bucket: str = BUCKET_MEDIA) -> int:
        """
        Delete all objects whose keys start with `prefix`.
        Returns the number of objects deleted (0 if none found).
        """
        def _delete_all() -> int:
            client = self._get_client()
            paginator = client.get_paginator("list_objects_v2")
            deleted = 0
            for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
                contents = page.get("Contents") or []
                if not contents:
                    continue
                keys = [{"Key": obj["Key"]} for obj in contents]
                for i in range(0, len(keys), 1000):
                    batch = keys[i : i + 1000]
                    client.delete_objects(
                        Bucket=bucket,
                        Delete={"Objects": batch, "Quiet": True},
                    )
                    deleted += len(batch)
            return deleted

        try:
            count = await asyncio.to_thread(_delete_all)
            if count:
                log.info("prefix_deleted", prefix=prefix, bucket=bucket, count=count)
            return count
        except Exception as exc:
            log.warning("prefix_delete_failed", prefix=prefix, bucket=bucket, error=str(exc))
            return 0


# ── Singleton ─────────────────────────────────────────────────────────────────

# Module-level singleton — shared across all requests in the same process
_storage = StorageService()


async def get_storage() -> StorageService:
    """FastAPI dependency — returns the singleton StorageService."""
    return _storage
