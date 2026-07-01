"""
ViraEdit — Synchronous S3/MinIO helpers for Celery ingestion tasks.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import boto3
import structlog
from botocore.config import Config

from config import settings

log = structlog.get_logger("viraedit.processors.storage_helpers")


class S3Storage:
    """Blocking S3 client — safe inside Celery workers."""

    def __init__(self) -> None:
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
            ),
            region_name=settings.S3_REGION,
        )
        self.bucket = settings.S3_BUCKET_MEDIA

    def put_object(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> None:
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    def put_file(
        self,
        key: str,
        local_path: Path,
        content_type: str = "video/mp4",
    ) -> None:
        self.client.upload_file(
            local_path.as_posix(),
            self.bucket,
            key,
            ExtraArgs={"ContentType": content_type},
        )
        log.debug("ingest_object_uploaded", key=key, bucket=self.bucket)

    def download_to_temp(self, key: str, job_id: str) -> Path:
        ext = Path(key).suffix or ".mp4"
        out_dir = Path(tempfile.gettempdir()) / "viraedit" / job_id
        out_dir.mkdir(parents=True, exist_ok=True)
        local_path = out_dir / f"download{ext}"
        self.client.download_file(self.bucket, key, local_path.as_posix())
        return local_path

    def get_presigned_url(self, key: str, expires: int = 3600, filename: str | None = None) -> str:
        params: dict = {"Bucket": self.bucket, "Key": key}
        if filename:
            safe = filename.replace('"', "")
            params["ResponseContentDisposition"] = f'attachment; filename="{safe}"'
        return self.client.generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=expires,
        )


storage_sync = S3Storage()
