"""
ViraEdit — Scoped regeneration with user prompt.

Re-runs chapters, shorts, highlights, suggestions, or master_edit
without a full re-upload.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

import structlog
from celery import Task

from celery_app import celery_app

log = structlog.get_logger("viraedit.tasks.regenerate")


@celery_app.task(
    name="tasks.regenerate.run",
    bind=True,
    max_retries=2,
    default_retry_delay=45,
    queue="analysis",
    soft_time_limit=240,
    time_limit=300,
)
def regenerate_asset(
    self: Task,
    asset_id: str,
    scope: str,
    user_prompt: str = "",
    reject_ids: list[str] | None = None,
) -> dict[str, Any]:
    from sqlalchemy import create_engine, text

    from config import settings

    scope_norm = (scope or "shorts").strip().lower()
    reject_ids = reject_ids or []
    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    engine = create_engine(sync_url, pool_pre_ping=True)

    log.info(
        "regenerate_started",
        asset_id=asset_id,
        scope=scope_norm,
        reject_count=len(reject_ids),
    )

    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT t.full_text, t.words, a.project_id, a.duration_seconds, a.storage_key
                FROM transcripts t
                JOIN assets a ON a.id = t.asset_id
                WHERE t.asset_id = :aid
            """),
            {"aid": asset_id},
        ).fetchone()

    if not row or not (row.full_text or "").strip():
        return {"error": "Transcript required", "asset_id": asset_id}

    project_id = str(row.project_id)
    duration = float(row.duration_seconds or 0.0)
    full_text = row.full_text or ""
    words = row.words or []
    storage_key = row.storage_key

    from tasks.analyze import (
        _attach_thumbnails,
        _insert_scene_row,
        _load_scenes_for_shorts,
        _map_suggestion_type,
        _set_asset_ready,
    )
    from tasks.model_router import BudgetState

    budget = BudgetState()
    replaced = 0

    try:
        micro_scenes = _load_micro_scenes(engine, asset_id)
        if not micro_scenes:
            micro_scenes = _load_scenes_for_shorts(engine, asset_id)

        if scope_norm in ("chapters", "master_edit", "suggestions"):
            from tasks.chapter_planner import (
                apply_chapter_titles_from_llm,
                merge_micro_scenes_to_chapters,
            )
            from tasks.ai_client import plan_chapters

            chapters = merge_micro_scenes_to_chapters(micro_scenes, duration)
            if user_prompt:
                chapters = _apply_user_prompt_chapters(chapters, user_prompt, full_text)
            try:
                ch_result = plan_chapters(chapters, duration, budget=budget)
                chapters = apply_chapter_titles_from_llm(
                    chapters, ch_result.content.get("chapters", [])
                )
            except Exception as exc:
                log.warning("regen_chapter_llm_failed: %s", exc)

            with engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM scenes WHERE asset_id = :aid AND scene_kind = 'chapter'"),
                    {"aid": asset_id},
                )
                for i, ch in enumerate(chapters):
                    ch["index"] = i
                    _insert_scene_row(conn, asset_id, ch, scene_kind="chapter", index=i)

            if storage_key:
                _attach_thumbnails(engine, asset_id, project_id, storage_key, chapters)
            replaced = len(chapters)

        if scope_norm == "shorts":
            from tasks.shorts_analyzer import enrich_short_candidates
            from tasks.shorts_engine import run_shorts_engine

            shorts = run_shorts_engine(micro_scenes, "podcast", duration)
            if user_prompt:
                shorts = _filter_shorts_by_prompt(shorts, user_prompt, reject_ids)
            shorts = enrich_short_candidates(shorts, budget)
            with engine.begin() as conn:
                if reject_ids:
                    conn.execute(
                        text(
                            "UPDATE suggestions SET status = 'REJECTED' "
                            "WHERE asset_id = :aid AND id = ANY(CAST(:ids AS uuid[]))"
                        ),
                        {"aid": asset_id, "ids": reject_ids},
                    )
                conn.execute(
                    text(
                        "DELETE FROM suggestions WHERE asset_id = :aid AND type = 'SHORT_CLIP'"
                    ),
                    {"aid": asset_id},
                )
                for short_action in shorts:
                    _insert_short_suggestion(conn, project_id, asset_id, short_action)
            replaced = len(shorts)

        if scope_norm == "highlights":
            from tasks.highlights_engine import (
                build_highlight_records,
                extract_highlight_candidates,
            )

            chapters = _load_chapters(engine, asset_id)
            cands = extract_highlight_candidates(micro_scenes, chapters, duration)
            if user_prompt:
                cands = _filter_highlights_by_prompt(cands, user_prompt)
            records = build_highlight_records(cands, project_id, asset_id)
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE highlights SET superseded = true WHERE asset_id = :aid"),
                    {"aid": asset_id},
                )
                for hl in records:
                    conn.execute(
                        text("""
                            INSERT INTO highlights (
                                id, asset_id, project_id, start_time, end_time,
                                title, summary, promo_copy_en, promo_caption_ne,
                                highlight_score, platform_packs, thumbnail_url,
                                status, superseded, created_at, updated_at
                            ) VALUES (
                                :id, :asset_id, :project_id, :start_time, :end_time,
                                :title, :summary, :promo_copy_en, :promo_caption_ne,
                                :highlight_score, CAST(:platform_packs AS jsonb),
                                :thumbnail_url, 'detected', false, NOW(), NOW()
                            )
                        """),
                        {
                            **hl,
                            "platform_packs": json.dumps(
                                hl["platform_packs"], ensure_ascii=False
                            ),
                        },
                    )
            if storage_key and records:
                _attach_thumbnails(
                    engine, asset_id, project_id, storage_key, records, id_field="id"
                )
            replaced = len(records)

        if scope_norm in ("suggestions", "master_edit"):
            from tasks.master_edit_planner import (
                build_rule_based_master_suggestions,
                map_llm_master_plan_to_suggestions,
            )
            from tasks.ai_client import plan_master_edit

            me = plan_master_edit(
                micro_scenes, {}, [], "podcast", duration, budget=budget
            )
            suggestions = map_llm_master_plan_to_suggestions(me.content)
            if not suggestions:
                suggestions = build_rule_based_master_suggestions(
                    micro_scenes, [], {}, "podcast"
                )
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "DELETE FROM suggestions WHERE asset_id = :aid "
                        "AND action->>'master_edit' = 'true'"
                    ),
                    {"aid": asset_id},
                )
                for sug in suggestions:
                    conn.execute(
                        text("""
                            INSERT INTO suggestions (
                                id, project_id, asset_id, type, title, description,
                                action, confidence, status, start_time, end_time,
                                created_at, updated_at
                            ) VALUES (
                                :id, :project_id, :asset_id, :type, :title, :description,
                                CAST(:action AS jsonb), :confidence, 'PENDING',
                                :start_time, :end_time, NOW(), NOW()
                            )
                        """),
                        {
                            "id": str(uuid.uuid4()),
                            "project_id": project_id,
                            "asset_id": asset_id,
                            "type": _map_suggestion_type(sug.get("type", "cut")),
                            "title": sug.get("title", ""),
                            "description": (
                                (sug.get("description", "") + " " + user_prompt).strip()
                                if user_prompt
                                else sug.get("description", "")
                            ),
                            "action": json.dumps(sug.get("action", {}), ensure_ascii=False),
                            "confidence": float(sug.get("confidence", 0.75)),
                            "start_time": sug.get("start_time"),
                            "end_time": sug.get("end_time"),
                        },
                    )
            replaced = len(suggestions)

        _set_asset_ready(engine, asset_id)
        return {
            "asset_id": asset_id,
            "scope": scope_norm,
            "replaced_count": replaced,
            "user_prompt": user_prompt,
        }

    except Exception as exc:
        log.error("regenerate_failed", asset_id=asset_id, error=str(exc), exc_info=True)
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        return {"error": str(exc), "asset_id": asset_id}


def _load_micro_scenes(engine: Any, asset_id: str) -> list[dict]:
    from sqlalchemy import text

    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT index, start_time, end_time, title, summary, topics, emotion,
                       energy_level, transcript_excerpt, is_highlight, highlight_score,
                       retention_score, platform_scores
                FROM scenes
                WHERE asset_id = :aid AND scene_kind = 'micro'
                ORDER BY index
            """),
            {"aid": asset_id},
        ).fetchall()
    return [_row_to_scene(r) for r in rows]


def _load_chapters(engine: Any, asset_id: str) -> list[dict]:
    from sqlalchemy import text

    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT index, start_time, end_time, title, summary, topics
                FROM scenes
                WHERE asset_id = :aid AND scene_kind = 'chapter'
                ORDER BY index
            """),
            {"aid": asset_id},
        ).fetchall()
    return [
        {
            "index": int(r.index),
            "start_time": float(r.start_time),
            "end_time": float(r.end_time),
            "title": r.title or "",
            "summary": r.summary or "",
            "topics": r.topics or [],
        }
        for r in rows
    ]


def _row_to_scene(r: Any) -> dict:
    platform_scores = r.platform_scores if isinstance(r.platform_scores, dict) else {}
    return {
        "index": int(r.index),
        "start_time": float(r.start_time),
        "end_time": float(r.end_time),
        "title": r.title or "",
        "summary": r.summary or "",
        "topics": r.topics or [],
        "emotion": r.emotion or "neutral",
        "energy_level": float(r.energy_level or 0.5),
        "transcript_excerpt": r.transcript_excerpt or "",
        "is_highlight": bool(r.is_highlight),
        "highlight_score": float(r.highlight_score or 0.5),
        "retention_score": float(r.retention_score or 0.5),
        "platform_scores": platform_scores,
        "intent": platform_scores.get("intent", "other"),
    }


def _apply_user_prompt_chapters(
    chapters: list[dict], user_prompt: str, full_text: str
) -> list[dict]:
    """Lightweight keyword boost — full LLM regen happens via plan_chapters."""
    prompt_l = user_prompt.lower()
    for ch in chapters:
        blob = f"{ch.get('title', '')} {ch.get('summary', '')}".lower()
        if any(w in blob for w in prompt_l.split() if len(w) > 3):
            ch["summary"] = f"{ch.get('summary', '')} (matches: {user_prompt[:80]})"
    return chapters


def _filter_shorts_by_prompt(
    shorts: list[dict], user_prompt: str, reject_ids: list[str]
) -> list[dict]:
    pl = user_prompt.lower()
    filtered = [
        s
        for s in shorts
        if pl in (s.get("title", "") + s.get("summary", "")).lower()
        or pl in (s.get("transcript_excerpt", "") or "").lower()
    ]
    return filtered if filtered else shorts


def _filter_highlights_by_prompt(cands: list[dict], user_prompt: str) -> list[dict]:
    pl = user_prompt.lower()
    filtered = [
        c
        for c in cands
        if pl in (c.get("title", "") + c.get("summary", "")).lower()
    ]
    return filtered if filtered else cands


def _insert_short_suggestion(
    conn: Any, project_id: str, asset_id: str, short_action: dict
) -> None:
    from sqlalchemy import text

    sug_id = str(uuid.uuid4())
    confidence = round(min(short_action.get("nepal_weighted_score", 5.0) / 10.0, 1.0), 2)
    conn.execute(
        text("""
            INSERT INTO suggestions (
                id, project_id, asset_id, type, title, description,
                action, confidence, status, start_time, end_time,
                created_at, updated_at
            ) VALUES (
                :id, :project_id, :asset_id, 'SHORT_CLIP', :title, :description,
                CAST(:action AS jsonb), :confidence, 'PENDING', :start_time, :end_time,
                NOW(), NOW()
            )
        """),
        {
            "id": sug_id,
            "project_id": project_id,
            "asset_id": asset_id,
            "title": short_action.get("title", "Short Clip"),
            "description": short_action.get("about") or short_action.get("description", ""),
            "action": json.dumps(short_action, ensure_ascii=False),
            "confidence": confidence,
            "start_time": short_action.get("start_time"),
            "end_time": short_action.get("end_time"),
        },
    )
