# ViraEdit — Known Limitations

This document records honest limitations discovered during the Phase 08 reliability
audit. Prefer surfacing these in the product UI where possible.

## Ingestion (yt-dlp)

- **Platform breakage:** TikTok, Instagram, and YouTube change anti-scraping measures
  without notice. Downloads may fail until yt-dlp is updated.
- **Mitigation:** Human-readable error messages; weekly canary script at
  `scripts/canary_download_test.py` (run manually or via cron).
- **Workaround:** Upload the video file directly instead of pasting a URL.

## Captions (Nepali STT)

- **Code-switching:** Mixed Nepali/English speech can reduce timestamp accuracy and
  confuse language detection.
- **Mitigation:** Devanagari ratio check flags likely mismatches via `language_warning`
  in transcript quality metrics and caption job results.
- **Fonts:** `nepali_bold` caption burn-in requires Noto Sans Devanagari on the
  FFmpeg `fontsdir` path in the deployed environment.

## Text Editor (FFmpeg cuts)

- **Keyframe drift:** `-c copy` cuts are fast but may drift up to ~1s on sparse
  keyframe encodes.
- **Mitigation:** Shorts and sizzle pipelines use `apply_cuts_precise(force_reencode=True)`.
  Chapter-length cuts keep fast stream copy where sub-second accuracy is irrelevant.

## Reframe (face tracking)

- **Sparse faces:** Wide shots, profiles, or B-roll without faces fall back to
  center crop with a user-visible warning.
- **Dependencies:** Face tracking requires `mediapipe` and OpenCV. If unavailable,
  center crop is used automatically.
- **Performance:** Per-frame reframing is acceptable for short clips but not for
  full-length exports.

## AI budget & local fallback

- **Ollama quality:** Local Llama models are weaker at structured JSON than cloud
  models. Chapter and sizzle detection validate JSON strictly and show a clear error
  if local fallback output is unusable; rule-based fallbacks still run afterward.
- **Vision tasks:** Style analysis and asset tagging do not fall back to Ollama.

## Asset matching (Phase 02)

- **Thresholds:** `MATCH_THRESHOLD=0.75` and `PARTIAL_THRESHOLD=0.45` are starting
  guesses, not validated on production data. Match scores are logged at INFO level
  for manual tuning (`asset_match_scored` in logs).
- **Manual audit:** Review at least 20 real template runs before treating thresholds
  as production-ready.

## Remotion rendering (Phase 09)

- Not yet implemented. Caption burn-in currently uses FFmpeg ASS subtitles.

## Testing gaps

- End-to-end Nepali code-switching validation requires 5+ real podcast samples with
  manual timestamp review — not fully automated in CI.
- Integration tests for AI spend and asset APIs require full DB (`asyncpg`) setup.
