# Phase 8 — Fine-Tuning & Reliability Audit of Existing Modules

## Purpose

Before building further on top of the original Ingestion, Captions, Text-Editor,
Enhancements, Reframe, and Workspace modules, this phase is a structured audit pass:
verify each one actually works reliably in practice, fix what's fragile, and
document known limitations honestly rather than assuming they're solid.

This phase produces no new user-facing features — it's hardening work. Run it
**after** Phases 0-7 are functionally complete, using real test videos including
Nepali-language content, since that's a core requirement that's easy to silently
under-test.

---

## Audit Checklist by Module

### 1. Ingestion (yt-dlp downloads)

**Known fragility:** Instagram and TikTok actively change their anti-scraping
measures; yt-dlp extractors can break without warning.

```python
# backend/app/processors/downloader.py — add resilience
import yt_dlp

def download_video(url: str, job_id: str) -> str:
    out_dir = os.path.join(settings.temp_dir, job_id)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "raw.mp4")

    ydl_opts = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "outtmpl": out_path,
        "quiet": True,
        "no_warnings": True,
        "ffmpeg_location": os.path.dirname(settings.ffmpeg_path),
        "retries": 3,
        "socket_timeout": 30,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e)
        if "private" in error_msg.lower():
            raise ValueError("This video is private or requires login to view")
        if "unavailable" in error_msg.lower():
            raise ValueError("This video is no longer available")
        # Generic failure — surface a clear message rather than a stack trace
        raise ValueError(
            "Couldn't download this video. The platform may have changed how "
            "it serves content — try a different link or upload the file directly."
        )

    if not os.path.exists(out_path):
        raise ValueError("Download completed but no file was produced — try again")

    return out_path
```

**Audit action:** Add a weekly automated test (real cron job or manual checklist)
that attempts to download one known-public TikTok, Instagram Reel, and YouTube
Short, alerting if any fail — catches yt-dlp extractor breakage early rather than
discovering it from a user complaint.

---

### 2. Captions (ElevenLabs Scribe — Nepali accuracy)

**Known fragility:** Code-switching (Nepali/English mixed mid-sentence, very common
in Nepal) can confuse language auto-detection and hurt word-timestamp accuracy.

**Audit action:** Test with at least 5 real Nepali podcast/recording samples that
include code-switching. For each, manually verify:
- Word-level timestamps are within ~200ms of actual speech
- Devanagari text renders correctly in the ASS subtitle file (no mojibake/garbled characters)
- The `nepali_bold` caption style font actually loads in the FFmpeg render (verify
  `fontsdir` path resolves correctly in the deployed environment, not just locally)

```python
# backend/app/processors/transcriber.py — add explicit language confidence check
async def _transcribe_elevenlabs(audio_path: str, language: str) -> dict:
    # ... existing implementation ...

    # NEW: if requested Nepali but very few Devanagari characters detected,
    # something likely went wrong (wrong language picked up, or audio is
    # actually English) — flag for the calling code to surface a warning
    if language == "ne":
        devanagari_chars = sum(1 for c in data.get("text", "") if "\u0900" <= c <= "\u097F")
        total_chars = max(len(data.get("text", "")), 1)
        devanagari_ratio = devanagari_chars / total_chars
        if devanagari_ratio < 0.3:
            # Likely a language mismatch — don't fail, but flag it
            result_language_warning = (
                "Transcription completed but detected mostly non-Nepali text. "
                "If your audio is in Nepali, the captions may need review."
            )
        else:
            result_language_warning = None
    else:
        result_language_warning = None

    # ... attach result_language_warning to the returned dict ...
```

**Fix:** Surface `language_warning` in the job result and show it to the user in
the caption review screen rather than silently shipping potentially-wrong captions.

---

### 3. Text Editor (FFmpeg cut pipeline)

**Known fragility:** `-c copy` (stream copy, no re-encode) cuts are fast but only
produce frame-accurate cuts at keyframe boundaries. If the source video has sparse
keyframes (common in some screen recordings or long GOP encodes), cuts can be off
by up to a second or include unwanted trailing frames.

**Fix:** Detect when frame-accurate cuts are required and fall back to re-encoding
for those specific cuts.

```python
# backend/app/processors/text_editor.py — add keyframe-aware cutting
def apply_cuts_precise(input_path: str, output_path: str, cuts: list,
                       force_reencode: bool = False) -> str:
    """
    Like apply_cuts, but when force_reencode=True (or when keyframe spacing is
    detected as too sparse), re-encodes instead of stream-copying for accurate
    cuts. Slower but eliminates the up-to-1-second drift issue with -c copy.
    """
    duration = _get_duration(input_path)
    keep = _cuts_to_keep(cuts, duration)
    if not keep:
        raise ValueError("All segments would be removed")

    part_files = []
    for i, seg in enumerate(keep):
        part = input_path + f".part{i}.mp4"
        codec_args = (
            ["-c:v", "libx264", "-preset", "fast", "-c:a", "aac"]
            if force_reencode else ["-c", "copy"]
        )
        subprocess.run([
            settings.ffmpeg_path, "-i", input_path,
            "-ss", str(seg["start"]), "-to", str(seg["end"]),
            *codec_args, part, "-y",
        ], check=True, capture_output=True)
        part_files.append(part)

    concat_file = input_path + ".concat.txt"
    with open(concat_file, "w") as f:
        for p in part_files:
            f.write(f"file '{p}'\n")

    concat_codec = ["-c", "copy"]  # parts are already consistently encoded by this point
    subprocess.run([
        settings.ffmpeg_path, "-f", "concat", "-safe", "0",
        "-i", concat_file, *concat_codec,
        output_path, "-y",
    ], check=True, capture_output=True)

    for p in part_files + [concat_file]:
        if os.path.exists(p):
            os.remove(p)
    return output_path
```

**Audit action:** Use `force_reencode=True` by default for all Phase 3/4/5 short-clip
cutting (where sub-second accuracy at clip boundaries genuinely matters for a
3-5 second hook clip), and keep fast `-c copy` only for Phase 4's coarser
chapter-length cuts where a 1-second drift on a 10-minute chapter is irrelevant.

---

### 4. Reframe (MediaPipe face tracking)

**Known fragility:** `model_selection=0` (short-range face detection model) performs
poorly on wide shots or side profiles. If no face is detected for a long stretch,
the crop window can jump abruptly when detection resumes.

```python
# backend/app/processors/reframer.py — add smoothing for detection gaps + use
# the more permissive model
def _face_track(input_path: str, output_path: str, target_w: int, target_h: int) -> str:
    from scipy.ndimage import uniform_filter1d
    mp_face = mp.solutions.face_detection

    cap = cv2.VideoCapture(input_path)
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    crop_h = orig_h
    crop_w = int(orig_h * (target_w / target_h))
    if crop_w > orig_w:
        crop_w = orig_w
        crop_h = int(orig_w * (target_h / target_w))

    face_cx_by_frame: dict = {}
    # CHANGED: model_selection=1 = full-range model, much better for varied framing
    with mp_face.FaceDetection(model_selection=1, min_detection_confidence=0.4) as fd:
        idx = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            if idx % 5 == 0:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = fd.process(rgb)
                if result.detections:
                    bb = result.detections[0].location_data.relative_bounding_box
                    cx = int((bb.xmin + bb.width / 2) * orig_w)
                    face_cx_by_frame[idx] = cx
            idx += 1
    cap.release()

    detection_ratio = len(face_cx_by_frame) / max(1, total // 5)

    # NEW: if face detection coverage is too sparse (<30% of sampled frames),
    # face-tracking would produce jarring jumps — fall back to center crop
    # and flag this so the calling code can inform the user
    if detection_ratio < 0.3:
        return _center_crop(input_path, output_path, target_w, target_h), "low_face_detection_used_center_crop"

    # ... rest of interpolation/smoothing/writing logic unchanged ...
```

**Audit action:** Update all call sites of `_face_track` / `reframe_video` to handle
the new fallback signal and surface "We couldn't reliably track a face in this clip,
so we centered it instead" to the user rather than silently producing a jumpy crop.

---

### 5. AI Budget Tracker — Ollama Fallback Quality

**Known fragility:** The original design assumes Ollama can transparently substitute
for OpenAI/Gemini when budget is exceeded, but a local Llama model is dramatically
weaker at structured JSON output and vision tasks. Silently falling back can produce
garbage results (malformed JSON, nonsensical chapter titles) that then crash
downstream `json.loads()` calls.

**Fix:** Wrap every Ollama fallback call with strict JSON validation and a
clear user-facing message when local fallback quality is insufficient, rather than
letting a parse failure bubble up as an opaque 500 error.

```python
# Pattern to apply everywhere Ollama fallback is used (chapter detection,
# clip finding, sizzle finding):
async def _call_with_ollama_fallback(primary_call, fallback_call, *, action_name: str):
    try:
        return await primary_call()
    except Exception:
        pass  # primary failed for non-budget reasons too — still try fallback

    try:
        result = await fallback_call()
        if not isinstance(result, list) or not result:
            raise ValueError("Local model returned unusable output")
        return result
    except Exception:
        raise RuntimeError(
            f"Couldn't complete {action_name} right now — the AI budget limit was "
            f"reached and the backup option didn't produce usable results. "
            f"Try again in a moment, or contact your workspace owner about the AI budget."
        )
```

**Audit action:** Apply this wrapper to `clip_finder.py`, `chapter_detector.py`, and
`sizzle_finder.py`'s Ollama fallback paths. Never let raw `json.loads()` failures
from a local model reach the user as a stack trace.

---

### 6. Asset Matching Thresholds (Phase 2)

**Known fragility:** `MATCH_THRESHOLD = 0.75` and `PARTIAL_THRESHOLD = 0.45` are
reasonable starting guesses, not validated values. Too strict, and most slots will
show as "missing" even when a decent asset exists, frustrating users with
unnecessary generation costs. Too loose, and the original silent-substitution
problem effectively returns under a different name.

**Audit action:** After Phase 0-2 are live, manually review at least 20 real
template-matching runs across different workspace asset libraries. For each
slot, compare the algorithm's match/partial/missing verdict against what a human
editor would judge as acceptable. Adjust the threshold constants based on this
real data, and log the distribution of match scores to find a natural cutoff
rather than guessing.

```python
# Add lightweight logging to support this audit
import logging
logger = logging.getLogger("asset_matcher")

def score_asset_against_requirement(asset_tags: dict, req) -> float:
    score = ...  # existing logic
    logger.info(f"match_score slot_shot_type={req.shot_type} "
                f"asset_shot_type={asset_tags.get('shot_type')} score={score}")
    return score
```

---

## Audit Action Summary

| Module | Issue | Fix |
|---|---|---|
| Ingestion | yt-dlp breakage from platform changes | Better error messages + weekly canary test |
| Captions | Nepali code-switching accuracy | Devanagari ratio check + user-facing warning |
| Text Editor | `-c copy` keyframe drift on short clips | Force re-encode for Shorts/Sizzle (Phase 3/5), keep fast copy for Chapters |
| Reframe | Sparse face detection causes jumpy crops | `model_selection=1`, detection-ratio fallback to center crop with user message |
| AI Budget | Ollama fallback can return garbage | Strict validation wrapper, clear error instead of stack trace |
| Asset Matching | Unvalidated thresholds | Manual audit of 20+ real runs, log-driven threshold tuning |

---

## Checklist for Cursor

- [ ] `downloader.py` — add `retries`, `socket_timeout`, and human-readable error
      messages for private/unavailable/generic failures
- [ ] `transcriber.py` — add Devanagari ratio check, attach `language_warning` to
      transcription job results
- [ ] `text_editor.py` — add `apply_cuts_precise` with `force_reencode` option;
      update Phase 3 and Phase 5 call sites to use it
- [ ] `reframer.py` — switch to `model_selection=1`, add detection-ratio fallback
      with a returned warning flag; update all callers to surface this to the user
- [ ] Add `_call_with_ollama_fallback` wrapper pattern to `clip_finder.py`,
      `chapter_detector.py`, `sizzle_finder.py`
- [ ] Add scoring logger to `asset_matcher.py`, run the 20-sample manual audit,
      and adjust `MATCH_THRESHOLD`/`PARTIAL_THRESHOLD` based on real data
- [ ] Set up a basic weekly canary test (cron job or manual checklist) for
      Instagram/TikTok/YouTube download reliability
- [ ] Test the full Nepali pipeline end-to-end with 5+ real code-switched audio
      samples before considering Nepali support production-ready
- [ ] Document every known limitation found during this audit in a `KNOWN_LIMITATIONS.md`
      file at the project root — better to be explicit about what doesn't work
      perfectly yet than to let users discover it the hard way