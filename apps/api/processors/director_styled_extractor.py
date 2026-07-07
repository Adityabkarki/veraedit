"""
Director-styled platform shorts extraction — Phase 11 Phase 6.

Find moments once → reframe → compile Director timeline once per clip →
render-director per platform (Platform Variant Law).
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

import structlog

from processors.clip_finder import find_viral_moments
from processors.reframer import reframe_video
from processors.storage_helpers import storage_sync
from processors.text_editor import apply_cuts_precise, get_duration
from services.director.styled_shorts_pipeline import (
    ReframedClip,
    build_prepare_payload,
    load_styled_short_context_sync,
    prepare_styled_short_timeline_sync,
    render_multi_platform_variants_sync,
)

log = structlog.get_logger("viraedit.processors.director_styled_extractor")

PRESIGNED_EXPIRY_SECONDS = 86400

PLATFORM_DURATION_LIMITS = {
    "tiktok": 60,
    "instagram_reels": 90,
    "youtube_shorts": 60,
    "facebook_reels": 90,
}


def _reframe_local_clip(
    local_trimmed: Path,
    work_dir: Path,
    project_id: str,
    clip_index: int,
) -> ReframedClip:
    """Reframe a local trimmed clip and upload to temp storage."""
    reframed_path = work_dir / "reframed_9x16.mp4"
    _, warning = reframe_video(
        local_trimmed,
        reframed_path,
        1080,
        1920,
        mode="face_track",
    )
    reframed_id = f"extract-reframed-{uuid.uuid4().hex[:10]}"
    storage_key = f"temp/extract/{project_id}/clip_{clip_index}/{reframed_id}.mp4"
    storage_sync.put_file(storage_key, reframed_path, content_type="video/mp4")
    url = storage_sync.get_presigned_url(storage_key, expires=PRESIGNED_EXPIRY_SECONDS)
    return ReframedClip(
        local_path=reframed_path,
        storage_key=storage_key,
        presigned_url=url,
        reframed_asset_id=reframed_id,
        warning=warning,
    )


def _presigned_render_url(storage_key: str) -> str:
    import boto3
    from botocore.config import Config

    from config import settings

    client = boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        region_name=settings.S3_REGION,
    )
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET_RENDERS, "Key": storage_key},
        ExpiresIn=PRESIGNED_EXPIRY_SECONDS,
    )


async def extract_director_styled_shorts_for_platforms(
    video_path: str | Path,
    transcript: dict[str, Any],
    platforms: list[str],
    work_dir: str | Path,
    max_clips: int = 5,
    *,
    project_id: str,
) -> dict[str, list[dict[str, Any]]]:
    """Director-styled extraction replacing FFmpeg caption-burn per platform."""
    from tasks.render_task import _ffprobe_duration

    video = Path(video_path)
    work = Path(work_dir)
    work.mkdir(parents=True, exist_ok=True)

    if not platforms:
        return {}

    tightest_limit = min(PLATFORM_DURATION_LIMITS.get(p, 60) for p in platforms)
    candidates = await find_viral_moments(
        transcript,
        max_clips=max_clips,
        target_duration=tightest_limit,
        content_type="general",
    )

    ctx = load_styled_short_context_sync(project_id)
    results: dict[str, list[dict[str, Any]]] = {p: [] for p in platforms}
    total_duration = get_duration(video)

    for i, cand in enumerate(candidates):
        clip_dir = work / f"clip_{i}"
        clip_dir.mkdir(parents=True, exist_ok=True)
        trimmed_path = clip_dir / "trimmed.mp4"

        cuts: list[dict[str, float]] = []
        if cand["start"] > 0.1:
            cuts.append({"start": 0.0, "end": cand["start"]})
        if cand["end"] < total_duration - 0.1:
            cuts.append({"start": cand["end"], "end": total_duration})
        apply_cuts_precise(video, trimmed_path, cuts, force_reencode=True)

        clip_duration = float(cand["end"] - cand["start"])
        reframed = _reframe_local_clip(trimmed_path, clip_dir, project_id, i)

        asset_urls = dict(ctx.asset_urls)
        asset_urls[reframed.reframed_asset_id] = reframed.presigned_url

        payload = build_prepare_payload(
            ctx,
            start_time=0.0,
            end_time=clip_duration,
            hook=cand.get("title") or cand.get("hook"),
            viral_score=float(cand.get("score", 7.0)),
            reframed=reframed,
            base_only=True,
        )
        base_timeline = prepare_styled_short_timeline_sync(payload)

        platform_outputs = render_multi_platform_variants_sync(
            base_timeline,
            platforms,
            asset_urls=asset_urls,
            primary_video_src=reframed.presigned_url,
            upload_prefix=f"projects/{project_id}/shorts/extract/clip_{i}",
            ffprobe_duration=_ffprobe_duration,
        )

        for out in platform_outputs:
            if out.platform not in results:
                results[out.platform] = []
            results[out.platform].append({
                "key": out.storage_key,
                "url": _presigned_render_url(out.storage_key),
                "title": cand.get("title", f"Clip {i + 1}"),
                "score": float(cand.get("score", 7.0)),
                "duration": out.duration_seconds,
                "variant_key": out.variant_key,
                "director_styled": True,
                "reframe_warning": reframed.warning,
            })

        log.info(
            "director_styled_extract_clip_done",
            clip_index=i,
            platforms=[o.platform for o in platform_outputs],
        )

    return results
