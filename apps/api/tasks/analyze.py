"""
ViraEdit — AI Scene Analysis Celery task.

Pipeline (runs after transcription completes):
    1.  Load transcript from DB
    2.  Audio intelligence — detect silences, fillers, breaths from word timestamps
    3.  Store filler data to transcript.filler_words
    4.  Call Claude (Sonnet) → scene segmentation + viral scores
    5.  Classify scene intents (Nepali patterns, no API call)
    6.  Apply editorial scoring (content-type profiles)
    7.  Store enriched Scene records in DB
    8.  Plan silence-cut + filler-cut + J/L-cut suggestions (no API call)
    9.  Call Claude (Sonnet) → editing suggestions
   10.  Store all Suggestion records in DB
   11.  Update asset status → ready
   12.  Log Claude API costs to costs table

This task is queued automatically by the transcription task
when asset status transitions from "transcribing" → "analyzing".

Trigger from transcription task:
    celery_app.send_task("tasks.analyze.run", kwargs={"asset_id": str(asset_id)})

Or trigger manually for re-analysis:
    POST /api/v1/projects/{id}/assets/{id}/analyze
"""
from __future__ import annotations

import json
import uuid
from typing import Any

import structlog
from celery import Task

from celery_app import celery_app
from config import settings

log = structlog.get_logger("viraedit.tasks.analyze")


@celery_app.task(
    name="tasks.analyze.run",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    queue="analysis",
    soft_time_limit=300,   # 5 minutes
    time_limit=360,
)
def analyze_asset(self: Task, asset_id: str, scope: str = "all") -> dict[str, Any]:
    """
    Run AI chapter detection + audio intelligence on a transcribed asset.

    Args:
        asset_id: UUID string of the Asset to analyze.
        scope:    "all" | "chapters" | "shorts" — which pipeline stages to run.

    Returns:
        dict with scene_count, suggestion_count, total_cost_usd.
    """
    scope_norm = (scope or "all").strip().lower()
    if scope_norm not in ("all", "chapters", "shorts"):
        scope_norm = "all"
    run_chapters = scope_norm in ("all", "chapters")
    run_shorts = scope_norm in ("all", "shorts")
    from sqlalchemy import create_engine, text

    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    engine = create_engine(sync_url, pool_pre_ping=True)

    log.info("analysis_task_started", asset_id=asset_id)

    # ── 1. Load transcript ────────────────────────────────────────────────────

    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT t.id, t.full_text, t.words, t.language,
                       a.project_id, a.duration_seconds, a.status
                FROM transcripts t
                JOIN assets a ON a.id = t.asset_id
                WHERE t.asset_id = :asset_id
            """),
            {"asset_id": asset_id},
        ).fetchone()

    if row is None:
        log.error("analysis_no_transcript", asset_id=asset_id)
        return {"error": "No transcript found", "asset_id": asset_id}

    # Postgres enum stores UPPERCASE labels — compare case-insensitively.
    asset_status_upper = (row.status or "").upper()
    allowed_statuses = {"ANALYZING", "READY", "ERROR"}
    if asset_status_upper not in allowed_statuses:
        log.warning("analysis_skipped_wrong_status", asset_id=asset_id, status=row.status)
        return {"skipped": True, "status": row.status}

    transcript_id = str(row.id)
    full_text = row.full_text or ""
    words: list[dict] = row.words or []
    project_id = str(row.project_id)
    duration = float(row.duration_seconds or 0.0)

    from ws.events import PipelineStage
    from ws.publisher import emit_pipeline_error, emit_pipeline_progress

    emit_pipeline_progress(
        project_id,
        asset_id,
        stage=PipelineStage.SCENE_DETECTION.value,
        asset_status="analyzing",
        progress_percent=45,
    )

    if not full_text.strip():
        log.warning("analysis_empty_transcript", asset_id=asset_id)
        _set_asset_ready(engine, asset_id)
        return {"skipped": True, "reason": "empty_transcript"}

    if scope_norm == "shorts":
        return _run_shorts_only(
            engine=engine,
            asset_id=asset_id,
            project_id=project_id,
            words=words,
            duration=duration,
            emit_pipeline_progress=emit_pipeline_progress,
            emit_pipeline_error=emit_pipeline_error,
            task=self,
        )

    total_cost = 0.0
    scene_count = 0
    suggestion_count = 0
    content_type = "other"
    scenes_data: list[dict] = []
    audio_report = None

    try:
        # ── 2. Audio intelligence ─────────────────────────────────────────────

        from tasks.audio_intel import (
            analyze_audio_intelligence,
            plan_filler_cuts,
            plan_silence_cuts,
        )

        log.info("audio_intelligence_started", asset_id=asset_id, word_count=len(words))
        audio_report = analyze_audio_intelligence(words, duration)

        log.info(
            "audio_intelligence_complete",
            asset_id=asset_id,
            silences=audio_report.silence_count,
            fillers=audio_report.filler_count,
            speech_ratio=audio_report.speech_ratio,
        )

        # ── 3. Store filler data in transcript ────────────────────────────────

        with engine.begin() as conn:
            conn.execute(
                text("""
                    UPDATE transcripts
                    SET filler_words = CAST(:fillers AS jsonb), updated_at = NOW()
                    WHERE id = :tid
                """),
                {
                    "tid": transcript_id,
                    "fillers": json.dumps(
                        [f.to_dict() for f in audio_report.fillers],
                        ensure_ascii=False,
                    ),
                },
            )

        # ── 4. AI scene analysis (OpenAI gpt-4o-mini by default) ────────────

        log.info("calling_ai_scene_analysis", asset_id=asset_id, chars=len(full_text))

        from tasks.ai_client import analyze_scenes, generate_suggestions
        from tasks.model_router import BudgetState, budget_summary

        budget = BudgetState()

        scene_result = analyze_scenes(
            full_text=full_text,
            words=words,
            duration=duration,
            budget=budget,
        )
        total_cost += scene_result.cost_usd

        scenes_data: list[dict] = scene_result.content.get("scenes", [])
        best_hook: dict = scene_result.content.get("best_hook", {})
        filler_sections: list[dict] = scene_result.content.get("filler_sections", [])
        overall_viral_score = float(scene_result.content.get("overall_viral_score", 5.0))
        content_type = scene_result.content.get("content_type_detected", "other")

        # ── 5. Intent classification (Nepali patterns) ─────────────────────────

        from tasks.intent import classify_scenes

        scenes_data = classify_scenes(scenes_data)
        log.info("intent_classification_complete", asset_id=asset_id)

        # ── 6. Editorial scoring ──────────────────────────────────────────────

        from tasks.editorial import (
            adjust_scene_scores,
            check_cta_presence,
            plan_jl_cuts,
        )

        micro_scenes_data = adjust_scene_scores(scenes_data, content_type, overall_viral_score)
        cta_finding = check_cta_presence(micro_scenes_data, content_type)
        jl_cuts = plan_jl_cuts(micro_scenes_data, content_type)

        log.info(
            "editorial_scoring_complete",
            asset_id=asset_id,
            content_type=content_type,
            has_cta=cta_finding["has_cta"],
            jl_cut_suggestions=len(jl_cuts),
        )

        # ── 6b. Chapter planner (4–15 min) ────────────────────────────────────

        from tasks.chapter_planner import (
            apply_chapter_titles_from_llm,
            merge_micro_scenes_to_chapters,
        )

        chapters_data = merge_micro_scenes_to_chapters(micro_scenes_data, duration)
        if chapters_data and content_type in ("podcast", "interview", "other"):
            try:
                from tasks.ai_client import plan_chapters

                ch_result = plan_chapters(chapters_data, duration, budget=budget)
                total_cost += ch_result.cost_usd
                chapters_data = apply_chapter_titles_from_llm(
                    chapters_data, ch_result.content.get("chapters", [])
                )
            except Exception as ch_exc:
                log.warning("chapter_plan_llm_failed: %s", ch_exc)

        scenes_data = chapters_data  # UI-facing chapters
        shorts_source_scenes = micro_scenes_data  # finer granularity for shorts

        # ── 6c. Master edit planner ───────────────────────────────────────────

        master_edit_suggestions: list[dict] = []
        try:
            from tasks.master_edit_planner import (
                build_rule_based_master_suggestions,
                map_llm_master_plan_to_suggestions,
            )

            if content_type == "podcast":
                from tasks.ai_client import plan_master_edit

                me_result = plan_master_edit(
                    micro_scenes_data,
                    best_hook,
                    filler_sections,
                    content_type,
                    duration,
                    budget=budget,
                )
                total_cost += me_result.cost_usd
                master_edit_suggestions = map_llm_master_plan_to_suggestions(
                    me_result.content
                )
            if not master_edit_suggestions:
                master_edit_suggestions = build_rule_based_master_suggestions(
                    micro_scenes_data, filler_sections, best_hook, content_type
                )
        except Exception as me_exc:
            log.warning("master_edit_failed: %s", me_exc)

        # ── 7. Store micro-scenes + chapters ────────────────────────────────────

        storage_key = _load_asset_storage_key(engine, asset_id)

        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM scenes WHERE asset_id = :asset_id"),
                {"asset_id": asset_id},
            )
            conn.execute(
                text("DELETE FROM highlights WHERE asset_id = :asset_id"),
                {"asset_id": asset_id},
            )

            idx = 0
            for scene in micro_scenes_data:
                _insert_scene_row(conn, asset_id, scene, scene_kind="micro", index=idx)
                idx += 1

            for i, scene in enumerate(chapters_data):
                scene["index"] = i
                _insert_scene_row(conn, asset_id, scene, scene_kind="chapter", index=i)
                scene_count += 1

        log.info(
            "scenes_stored",
            asset_id=asset_id,
            chapters=scene_count,
            micro=len(micro_scenes_data),
        )

        # Thumbnails for chapters (non-fatal)
        if storage_key and chapters_data:
            try:
                _attach_thumbnails(engine, asset_id, project_id, storage_key, chapters_data)
            except Exception as thumb_exc:
                log.warning("chapter_thumbnails_failed: %s", thumb_exc)

        emit_pipeline_progress(
            project_id,
            asset_id,
            stage=PipelineStage.AUTO_EDITING.value,
            asset_status="analyzing",
            progress_percent=60,
            message="Chapters detected. Generating edit suggestions...",
        )

        # ── 8. Auto-generated suggestions (no Claude API call) ────────────────

        # Plan silence cuts from audio intelligence
        silence_cuts = plan_silence_cuts(audio_report, min_duration=1.5)
        filler_cut_plans = plan_filler_cuts(audio_report)

        rule_based_suggestions: list[dict] = []

        # Silence cut suggestions
        for cut in silence_cuts[:5]:  # cap at 5 silence suggestions
            rule_based_suggestions.append({
                "type": "cut",
                "title": f"Remove {cut['duration_saved']:.1f}s silence",
                "description": (
                    f"There is a {cut['duration_saved']:.1f}-second silence "
                    f"at {_fmt_time(cut['start'])}. Removing it will tighten the pacing."
                ),
                "start_time": cut["start"],
                "end_time": cut["end"],
                "action": cut,
                "confidence": 0.9,
                "impact": "medium",
            })

        # Filler cut suggestions (batch into one suggestion)
        if filler_cut_plans:
            total_filler_time = sum(f["duration_saved"] for f in filler_cut_plans)
            rule_based_suggestions.append({
                "type": "remove_filler",
                "title": f"Remove {audio_report.filler_count} filler words",
                "description": (
                    f"Found {audio_report.filler_count} filler words "
                    f"(saving ~{total_filler_time:.1f}s). "
                    "These include Nepali fillers like 'उम', 'आ', 'हैन र' "
                    "and English ones like 'um', 'uh'."
                ),
                "start_time": None,
                "end_time": None,
                "action": {"filler_cuts": filler_cut_plans, "total_saved_s": total_filler_time},
                "confidence": 0.85,
                "impact": "high" if audio_report.filler_count > 10 else "medium",
            })

        # CTA suggestion if none found
        if cta_finding["recommendation"]:
            rule_based_suggestions.append({
                "type": "hook_rewrite",
                "title": "Add a call to action",
                "description": cta_finding["recommendation"],
                "start_time": None,
                "end_time": None,
                "action": {"action": "add_cta", "position": "end"},
                "confidence": 0.75,
                "impact": "medium",
            })

        # J-cut / L-cut suggestions
        for jl in jl_cuts[:3]:  # cap at 3
            cut_title = (
                "J-cut transition" if jl["cut_type"] == "j_cut" else "L-cut transition"
            )
            rule_based_suggestions.append({
                "type": "transition",
                "title": cut_title,
                "description": jl["reason"],
                "start_time": micro_scenes_data[jl["scene_index"]].get("end_time"),
                "end_time": None,
                "action": jl,
                "confidence": 0.7,
                "impact": "low",
            })

        # ── 9. AI suggestions (same budget session as scene analysis) ─────────

        suggestion_result = generate_suggestions(
            scenes=micro_scenes_data,
            best_hook=best_hook,
            filler_sections=filler_sections,
            overall_score=overall_viral_score,
            budget=budget,
        )
        total_cost += suggestion_result.cost_usd

        log.info("budget_summary", asset_id=asset_id, **budget_summary(budget))

        claude_suggestions: list[dict] = suggestion_result.content.get("suggestions", [])

        from tasks.editorial_suggestions import (
            build_content_type_suggestions,
            enhance_suggestion,
        )

        editorial_extra = build_content_type_suggestions(
            words, micro_scenes_data, content_type, duration
        )

        # Combine: master edit, rule-based, Claude, editorial extras
        all_suggestions = (
            master_edit_suggestions
            + rule_based_suggestions
            + claude_suggestions
            + editorial_extra
        )

        for sug in all_suggestions:
            enhance_suggestion(sug, words, content_type, micro_scenes_data)

        # ── 10. Store suggestions ──────────────────────────────────────────────

        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM suggestions WHERE asset_id = :asset_id"),
                {"asset_id": asset_id},
            )

            for sug in all_suggestions:
                sug_id = str(uuid.uuid4())
                confidence = float(sug.get("confidence", 0.7))

                conn.execute(
                    text("""
                        INSERT INTO suggestions (
                            id, project_id, asset_id, type, title, description,
                            action, confidence, status, start_time, end_time,
                            created_at, updated_at
                        ) VALUES (
                            :id, :project_id, :asset_id, :type, :title, :description,
                            CAST(:action AS jsonb), :confidence, 'PENDING', :start_time, :end_time,
                            NOW(), NOW()
                        )
                    """),
                    {
                        "id": sug_id,
                        "project_id": project_id,
                        "asset_id": asset_id,
                        "type": _map_suggestion_type(sug.get("type", "cut")),
                        "title": sug.get("title", ""),
                        "description": sug.get("description", ""),
                        "action": json.dumps(sug.get("action", {}), ensure_ascii=False),
                        "confidence": confidence,
                        "start_time": sug.get("start_time"),
                        "end_time": sug.get("end_time"),
                    },
                )
                suggestion_count += 1

        log.info("suggestions_stored", asset_id=asset_id, count=suggestion_count)

        # ── 11. Log Claude costs ──────────────────────────────────────────────

        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO costs (
                        id, project_id, asset_id, model, task,
                        input_tokens, output_tokens, cost_usd,
                        created_at, updated_at
                    ) VALUES (
                        :id, :project_id, :asset_id, :model, 'scene_analysis',
                        :input_tokens, :output_tokens, :cost_usd,
                        NOW(), NOW()
                    )
                """),
                {
                    "id": str(uuid.uuid4()),
                    "project_id": project_id,
                    "asset_id": asset_id,
                    "model": scene_result.model,
                    "input_tokens": scene_result.input_tokens,
                    "output_tokens": scene_result.output_tokens,
                    "cost_usd": round(scene_result.cost_usd, 6),
                },
            )
            conn.execute(
                text("""
                    INSERT INTO costs (
                        id, project_id, asset_id, model, task,
                        input_tokens, output_tokens, cost_usd,
                        created_at, updated_at
                    ) VALUES (
                        :id, :project_id, :asset_id, :model, 'suggestions',
                        :input_tokens, :output_tokens, :cost_usd,
                        NOW(), NOW()
                    )
                """),
                {
                    "id": str(uuid.uuid4()),
                    "project_id": project_id,
                    "asset_id": asset_id,
                    "model": suggestion_result.model,
                    "input_tokens": suggestion_result.input_tokens,
                    "output_tokens": suggestion_result.output_tokens,
                    "cost_usd": round(suggestion_result.cost_usd, 6),
                },
            )

        # ── 12. Shorts engine (zero LLM cost — non-fatal inner try) ─────────

        if run_shorts:
            emit_pipeline_progress(
                project_id,
                asset_id,
                stage=PipelineStage.SHORTS.value,
                asset_status="analyzing",
                progress_percent=85,
                message="Extracting short clip candidates...",
            )

        try:
            if not run_shorts:
                shorts = []
            else:
                from tasks.shorts_engine import run_shorts_engine

                shorts = run_shorts_engine(shorts_source_scenes, content_type, duration)
                from tasks.shorts_analyzer import enrich_short_candidates

                shorts = enrich_short_candidates(shorts, budget)

            if run_shorts:
                with engine.begin() as conn:
                    for short_action in shorts:
                        sug_id = str(uuid.uuid4())
                        confidence = round(
                            min(short_action.get("nepal_weighted_score", 5.0) / 10.0, 1.0),
                            2,
                        )
                        best_platform = short_action.get("best_platform", "youtube")
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
                                "description": (
                                    f"{short_action.get('duration', 0):.0f}s clip — "
                                    f"best for {best_platform.title()}. "
                                    f"Nepal score: {short_action.get('nepal_weighted_score', 0):.1f}/10"
                                ),
                                "action": json.dumps(short_action, ensure_ascii=False),
                                "confidence": confidence,
                                "start_time": short_action.get("start_time"),
                                "end_time": short_action.get("end_time"),
                            },
                        )
                        suggestion_count += 1

                log.info("shorts_stored", asset_id=asset_id, count=len(shorts))

        except Exception as shorts_exc:
            # Non-fatal: shorts extraction failure should not block asset delivery.
            log.warning("shorts_engine_failed: %s", shorts_exc)

        # ── 12a. Highlights (promo packs) ─────────────────────────────────────

        try:
            from tasks.highlights_engine import (
                build_highlight_records,
                extract_highlight_candidates,
            )

            hl_candidates = extract_highlight_candidates(
                micro_scenes_data, chapters_data, duration
            )
            hl_records = build_highlight_records(hl_candidates, project_id, asset_id)
            if storage_key and hl_records:
                _attach_thumbnails(
                    engine, asset_id, project_id, storage_key, hl_records, id_field="id"
                )
            with engine.begin() as conn:
                for hl in hl_records:
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
                                :highlight_score, CAST(:platform_packs AS jsonb), :thumbnail_url,
                                :status, :superseded, NOW(), NOW()
                            )
                        """),
                        {
                            "id": hl["id"],
                            "asset_id": asset_id,
                            "project_id": project_id,
                            "start_time": hl["start_time"],
                            "end_time": hl["end_time"],
                            "title": hl["title"],
                            "summary": hl["summary"],
                            "promo_copy_en": hl["promo_copy_en"],
                            "promo_caption_ne": hl["promo_caption_ne"],
                            "highlight_score": hl["highlight_score"],
                            "platform_packs": json.dumps(
                                hl["platform_packs"], ensure_ascii=False
                            ),
                            "thumbnail_url": hl.get("thumbnail_url"),
                            "status": hl["status"],
                            "superseded": hl["superseded"],
                        },
                    )
            log.info("highlights_stored", asset_id=asset_id, count=len(hl_records))
        except Exception as hl_exc:
            log.warning("highlights_engine_failed: %s", hl_exc)

        # ── 12b. Podcast auto-edit suggestions ───────────────────────────────

        try:
            from tasks.podcast_autopilot import (
                build_podcast_autopilot_suggestions,
                persist_autopilot_suggestions,
            )

            autopilot = build_podcast_autopilot_suggestions(
                words, micro_scenes_data, content_type
            )
            if autopilot:
                with engine.begin() as conn:
                    n = persist_autopilot_suggestions(
                        conn, project_id, asset_id, autopilot
                    )
                    suggestion_count += n
                log.info("podcast_autopilot_stored", count=len(autopilot))
        except Exception as autopilot_exc:
            log.warning("podcast_autopilot_failed: %s", autopilot_exc)

        # ── 13. Visual opportunity engine (zero LLM cost — non-fatal inner try) ──

        try:
            from tasks.visual_engine import run_visual_engine

            visual_actions = run_visual_engine(full_text, words)

            with engine.begin() as conn:
                for vis_action in visual_actions:
                    sug_id = str(uuid.uuid4())
                    confidence = float(vis_action.get("confidence", 0.75))
                    visual_type = vis_action.get("visual_type", "statistic")
                    display_value = vis_action.get("display_value", "")
                    conn.execute(
                        text("""
                            INSERT INTO suggestions (
                                id, project_id, asset_id, type, title, description,
                                action, confidence, status, start_time, end_time,
                                created_at, updated_at
                            ) VALUES (
                                :id, :project_id, :asset_id, 'VISUAL_OPPORTUNITY', :title, :description,
                                CAST(:action AS jsonb), :confidence, 'PENDING', :start_time, :end_time,
                                NOW(), NOW()
                            )
                        """),
                        {
                            "id": sug_id,
                            "project_id": project_id,
                            "asset_id": asset_id,
                            "title": f"Visual: {display_value}",
                            "description": (
                                f"Add {vis_action.get('suggested_visual', 'graphic')} "
                                f"at {_fmt_time(vis_action.get('start_time', 0))} — "
                                f"{vis_action.get('nepali_label', '')}"
                            ),
                            "action": json.dumps(vis_action, ensure_ascii=False),
                            "confidence": confidence,
                            "start_time": vis_action.get("start_time"),
                            "end_time": vis_action.get("end_time"),
                        },
                    )
                    suggestion_count += 1

            log.info("visuals_stored", asset_id=asset_id, count=len(visual_actions))

        except Exception as visual_exc:
            # Non-fatal: visual engine failure should not block asset delivery.
            log.warning("visual_engine_failed: %s", visual_exc)

    except Exception as exc:
        log.error("analysis_failed", asset_id=asset_id, error=str(exc), exc_info=True)
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE assets SET status='ERROR', error_message=:msg, updated_at=NOW() "
                    "WHERE id=:id"
                ),
                {
                    "id": asset_id,
                    "msg": (
                        "Chapter analysis failed. Your transcript is ready — "
                        'use "Run chapters" to try again (OpenAI, not ElevenLabs).'
                    ),
                },
            )
        emit_pipeline_error(
            project_id,
            asset_id,
            stage=PipelineStage.SCENE_DETECTION.value,
            message=(
                "AI analysis failed. Your transcript is ready but scene "
                "detection couldn't complete. Please try re-analyzing."
            ),
        )
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        return {"error": str(exc), "asset_id": asset_id}

    # ── 14. Mark asset as ready ───────────────────────────────────────────────

    _set_asset_ready(engine, asset_id, content_type)

    emit_pipeline_progress(
        project_id,
        asset_id,
        stage=PipelineStage.READY.value,
        asset_status="ready",
        progress_percent=100,
        message="Analysis complete. Your project is ready to edit.",
    )

    log.info(
        "analysis_complete",
        asset_id=asset_id,
        scene_count=scene_count,
        suggestion_count=suggestion_count,
        total_cost_usd=round(total_cost, 6),
    )

    return {
        "asset_id": asset_id,
        "scene_count": scene_count,
        "suggestion_count": suggestion_count,
        "audio_intelligence": {
            "filler_count": audio_report.filler_count,
            "silence_count": audio_report.silence_count,
            "speech_ratio": audio_report.speech_ratio,
        },
        "total_cost_usd": round(total_cost, 6),
    }


# ── Shorts-only regeneration ──────────────────────────────────────────────────

def _run_shorts_only(
    *,
    engine: Any,
    asset_id: str,
    project_id: str,
    words: list[dict],
    duration: float,
    emit_pipeline_progress: Any,
    emit_pipeline_error: Any,
    task: Task,
) -> dict[str, Any]:
    """Regenerate short-clip candidates from existing chapters (no OpenAI)."""
    from sqlalchemy import text
    from ws.events import PipelineStage

    scenes_data = _load_scenes_for_shorts(engine, asset_id)
    if not scenes_data:
        msg = "No chapters found. Run chapter detection before regenerating shorts."
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE assets SET status='ERROR', error_message=:msg, updated_at=NOW() "
                    "WHERE id=:id"
                ),
                {"id": asset_id, "msg": msg},
            )
        emit_pipeline_error(
            project_id,
            asset_id,
            stage=PipelineStage.SHORTS.value,
            message=msg,
        )
        return {"error": msg, "asset_id": asset_id}

    content_type = "other"
    meta = _load_asset_content_type(engine, asset_id)
    if meta:
        content_type = meta

    emit_pipeline_progress(
        project_id,
        asset_id,
        stage=PipelineStage.SHORTS.value,
        asset_status="analyzing",
        progress_percent=85,
        message="Regenerating short clip candidates…",
    )

    suggestion_count = 0
    try:
        from tasks.shorts_engine import run_shorts_engine

        from tasks.model_router import BudgetState
        from tasks.shorts_analyzer import enrich_short_candidates

        budget = BudgetState()
        shorts = run_shorts_engine(scenes_data, content_type, duration)
        shorts = enrich_short_candidates(shorts, budget)
        with engine.begin() as conn:
            conn.execute(
                text(
                    "DELETE FROM suggestions WHERE asset_id = :aid AND type = 'SHORT_CLIP'"
                ),
                {"aid": asset_id},
            )
            for short_action in shorts:
                sug_id = str(uuid.uuid4())
                confidence = round(
                    min(short_action.get("nepal_weighted_score", 5.0) / 10.0, 1.0),
                    2,
                )
                best_platform = short_action.get("best_platform", "youtube")
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
                        "description": (
                            f"{short_action.get('duration', 0):.0f}s clip — "
                            f"best for {best_platform.title()}."
                        ),
                        "action": json.dumps(short_action, ensure_ascii=False),
                        "confidence": confidence,
                        "start_time": short_action.get("start_time"),
                        "end_time": short_action.get("end_time"),
                    },
                )
                suggestion_count += 1
    except Exception as exc:
        log.error("shorts_regeneration_failed", asset_id=asset_id, error=str(exc))
        if task.request.retries < task.max_retries:
            raise task.retry(exc=exc)
        return {"error": str(exc), "asset_id": asset_id}

    _set_asset_ready(engine, asset_id, content_type)
    emit_pipeline_progress(
        project_id,
        asset_id,
        stage=PipelineStage.READY.value,
        asset_status="ready",
        progress_percent=100,
        message="Shorts updated.",
    )
    return {
        "asset_id": asset_id,
        "short_count": suggestion_count,
        "scope": "shorts",
    }


def _load_scenes_for_shorts(engine: Any, asset_id: str) -> list[dict]:
    from sqlalchemy import text

    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT index, start_time, end_time, title, summary, topics, emotion,
                       energy_level, transcript_excerpt, is_highlight, highlight_score,
                       retention_score, platform_scores
                FROM scenes
                WHERE asset_id = :aid
                  AND (scene_kind = 'micro' OR scene_kind IS NULL)
                ORDER BY index
            """),
            {"aid": asset_id},
        ).fetchall()

    scenes: list[dict] = []
    for r in rows:
        platform_scores = r.platform_scores if isinstance(r.platform_scores, dict) else {}
        scenes.append({
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
        })
    return scenes


def _load_asset_content_type(engine: Any, asset_id: str) -> str | None:
    from sqlalchemy import text

    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT media_metadata->>'content_type' AS ct FROM assets WHERE id = :id"
            ),
            {"id": asset_id},
        ).fetchone()
    if row and row.ct:
        return str(row.ct)
    return None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _set_asset_ready(engine, asset_id: str, content_type: str | None = None) -> None:
    """Mark the asset status as 'ready' — final state after full pipeline."""
    from sqlalchemy import text
    with engine.begin() as conn:
        if content_type:
            conn.execute(
                text(
                    "UPDATE assets SET status='READY', error_message=NULL, "
                    "media_metadata = COALESCE(media_metadata, '{}'::jsonb) "
                    "|| jsonb_build_object('content_type', :content_type), "
                    "updated_at=NOW() WHERE id=:id"
                ),
                {"id": asset_id, "content_type": content_type},
            )
        else:
            conn.execute(
                text(
                    "UPDATE assets SET status='READY', error_message=NULL, updated_at=NOW() "
                    "WHERE id=:id"
                ),
                {"id": asset_id},
            )


def _insert_scene_row(
    conn: Any,
    asset_id: str,
    scene: dict,
    *,
    scene_kind: str,
    index: int,
    thumbnail_url: str | None = None,
) -> str:
    from sqlalchemy import text

    scene_id = str(uuid.uuid4())
    platform_scores = dict(scene.get("platform_scores") or {})
    platform_scores["intent"] = scene.get("intent", "other")
    platform_scores["editorial_adjusted_score"] = scene.get("editorial_adjusted_score", 5.0)
    platform_scores["qualifies_for_short"] = scene.get("qualifies_for_short", False)
    platform_scores["editorial_notes"] = scene.get("editorial_notes", [])
    platform_scores["scene_kind"] = scene_kind
    if scene.get("title_reason"):
        platform_scores["chapter_title_reason"] = scene.get("title_reason")

    conn.execute(
        text("""
            INSERT INTO scenes (
                id, asset_id, index, start_time, end_time,
                title, summary, topics, emotion, energy_level,
                transcript_excerpt, is_highlight, highlight_score,
                retention_score, platform_scores, scene_kind, thumbnail_url,
                created_at, updated_at
            ) VALUES (
                :id, :asset_id, :index, :start_time, :end_time,
                :title, :summary, CAST(:topics AS jsonb), :emotion, :energy_level,
                :transcript_excerpt, :is_highlight, :highlight_score,
                :retention_score, CAST(:platform_scores AS jsonb), :scene_kind, :thumbnail_url,
                NOW(), NOW()
            )
        """),
        {
            "id": scene_id,
            "asset_id": asset_id,
            "index": index,
            "start_time": float(scene.get("start_time", 0.0)),
            "end_time": float(scene.get("end_time", 0.0)),
            "title": scene.get("title", ""),
            "summary": scene.get("summary", ""),
            "topics": json.dumps(scene.get("topics", []), ensure_ascii=False),
            "emotion": scene.get("emotion", "neutral"),
            "energy_level": float(scene.get("energy_level", 0.5)),
            "transcript_excerpt": scene.get("transcript_excerpt", ""),
            "is_highlight": bool(scene.get("is_highlight", False)),
            "highlight_score": float(scene.get("highlight_score", 0.5)),
            "retention_score": float(scene.get("retention_score", 0.5)),
            "platform_scores": json.dumps(platform_scores, ensure_ascii=False),
            "scene_kind": scene_kind,
            "thumbnail_url": thumbnail_url,
        },
    )
    return scene_id


def _load_asset_storage_key(engine: Any, asset_id: str) -> str | None:
    from sqlalchemy import text

    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT storage_key FROM assets WHERE id = :id"),
            {"id": asset_id},
        ).fetchone()
    return row.storage_key if row else None


def _attach_thumbnails(
    engine: Any,
    asset_id: str,
    project_id: str,
    storage_key: str,
    items: list[dict],
    *,
    id_field: str = "index",
) -> None:
    """Download source video once and generate thumbnails for items (mutates dicts)."""
    import pathlib
    import tempfile

    from tasks.thumbnail_service import generate_thumbnail_for_item, thumbnail_public_url
    from tasks.transcribe import _download_from_minio

    with tempfile.TemporaryDirectory() as tmp:
        video_path = _download_from_minio(storage_key, pathlib.Path(tmp))
        for item in items[:10]:
            item_key = str(item.get(id_field, item.get("id", "0")))
            thumb_key = generate_thumbnail_for_item(
                video_path=video_path,
                project_id=project_id,
                asset_id=asset_id,
                item_id=item_key,
                item=item,
            )
            if thumb_key:
                url = thumbnail_public_url(thumb_key)
                item["thumbnail_url"] = url
                if id_field == "index":
                    from sqlalchemy import text

                    with engine.begin() as conn:
                        conn.execute(
                            text(
                                "UPDATE scenes SET thumbnail_url = :url, updated_at = NOW() "
                                "WHERE asset_id = :aid AND scene_kind = 'chapter' AND index = :idx"
                            ),
                            {"url": url, "aid": asset_id, "idx": int(item.get("index", 0))},
                        )
                elif id_field == "id":
                    from sqlalchemy import text

                    with engine.begin() as conn:
                        conn.execute(
                            text(
                                "UPDATE highlights SET thumbnail_url = :url, updated_at = NOW() "
                                "WHERE id = :id"
                            ),
                            {"url": url, "id": item.get("id")},
                        )


def _fmt_time(seconds: float) -> str:
    """Format seconds as M:SS for human-readable suggestions."""
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m}:{s:02d}"


_VALID_SUGGESTION_TYPES = {
    "hook_rewrite", "cut", "transition", "caption",
    "highlight", "short_clip", "remove_filler",
    "reorder", "audio_fix", "visual_opportunity",
}


def _map_suggestion_type(raw_type: str) -> str:
    """
    Map Claude's suggestion type to our enum, defaulting to CUT.

    Returns the UPPERCASE enum label (HOOK_REWRITE, CUT, …) because the
    Postgres suggestion_type_enum stores uppercase labels.
    """
    normalized = raw_type.lower().replace("-", "_").replace(" ", "_")
    valid = normalized if normalized in _VALID_SUGGESTION_TYPES else "cut"
    return valid.upper()
