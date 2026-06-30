# ViraEdit — North Star (Read This Before Any Other Skill File)

## Who the user actually is

The user has **never edited a video and never wants to learn**. They are a podcaster,
consultant, or small business owner. Every word like "keyframe", "mask", "blend mode",
"corner radius" is something we must hide from them completely — not simplify, **hide**.

If a feature requires the user to understand video editing vocabulary to use it, that
feature is built wrong, no matter how good the underlying engine is.

## The actual product

ViraEdit takes two inputs from the user and produces a finished, ready-to-post video
with zero manual editing:

1. **A reference video** (a TikTok/Instagram/YouTube link, or any uploaded clip) —
   "make something that looks/feels like this"
2. **Their own raw materials** — footage, images, text, logo, brand colors

The system's job is to:
- Understand the reference's style completely (pacing, captions, transitions, hooks, music mood, visual treatment)
- Map the user's own assets onto that style
- **When the user doesn't have a matching asset, generate one** (via Gemini image/video generation) rather than silently improvising with the wrong asset or leaving a gap
- Output finished, platform-correct files the user can download and post immediately

There is no timeline scrubbing required. There is no manual slider-pulling required.
Those things can exist as an *optional* "fine-tune" layer for power users later, but
they are never the primary interaction.

## The four core jobs to be done

1. **Style Cloning, fixed** — Paste a reference link → get back a template that is
   either (a) fully populated with the user's own matching assets, or (b) clearly
   marks every gap with a one-click "Generate this" action. Never silently substitute.

2. **Shorts/Reels Extraction** — Give it a long video → it finds and cuts the best
   moments, already captioned, already reframed correctly per platform (TikTok 9:16,
   Instagram Reels 9:16, YouTube Shorts 9:16, Facebook Reels 9:16/1:1), ready to
   download and upload. One click per platform.

3. **Chapter Extraction** — Give it a long video (podcast, webinar, recording) → it
   detects logical chapter boundaries and cuts each chapter into its own
   standalone downloadable clip, correctly captioned.

4. **Sizzle / Trailer / Highlight Reel** — Give it a long video → it detects the most
   promo-worthy, exciting, high-energy moments across the whole video and assembles
   them into one fast-cut highlight/trailer clip — the "coming up in this episode"
   style cut.

## The two AI engines and why both

- **Gemini (Vision + Generation)**: used for (a) analyzing the reference video frame-by-frame
  to extract a structured style fingerprint, (b) generating missing images/elements/
  effects when the user's library doesn't have a match, (c) acting as the fallback
  "make something similar" engine when an exact match isn't possible.
- **OpenAI gpt-4o-mini**: used for transcript-based reasoning — virality scoring,
  chapter boundary detection, sizzle moment detection, prompt enhancement — i.e.
  anything operating on text/transcript rather than pixels.

Both engines' every single call is metered and shown to the user as **AI Spend**,
visible continuously throughout editing, not just at the end. See Phase 7.

## What "fine-tuning the existing system" means

Phases 0–8 below assume the Ingestion, Captions, Text-Editor, Reframe, and Workspace
modules already built (from the earlier skill set) are mostly sound and reusable as
infrastructure. What's broken or missing is specifically:

1. Style cloning's asset-matching logic (Phase 1 + 2)
2. The absence of a true one-click "Apply Template" flow for non-editors (Phase 6)
3. The absence of dedicated Shorts/Chapter/Sizzle extraction pipelines as first-class
   features with their own UI (Phases 3, 4, 5)
4. The absence of any AI spend visibility (Phase 7)
5. No audit of which existing pipelines are actually reliable in practice (Phase 8)

## Phase Order

```
Phase 0 — Foundation: Asset Library + Asset Tagging (everything else depends on this)
Phase 1 — Style Intelligence v2: Gemini "Director's Blueprint" (visual + audio fingerprint)
Phase 2 — Asset Gap Resolution: detect missing assets + generate-on-click
Phase 3 — Shorts/Reels Extraction (platform-correct, downloadable)
Phase 4 — Chapter Extraction (standalone downloadable chapter clips)
            + PATCH-audio-energy.md (apply after the base Phase 4 implementation)
Phase 5 — Sizzle/Trailer/Highlight Reel generation
            (benefits from Phase 4's audio-energy patch too — see that file)
Phase 6 — One-Click Apply: the actual non-editor user flow tying 0-5 together
Phase 7 — AI Spend Meter: live, per-action, per-project cost visibility
Phase 8 — Fine-Tuning & Reliability Audit of existing modules
Phase 9 — Remotion-Based Caption & Motion Graphics Rendering (upgrades typography
            quality across Phases 3/4/5/6; implement after those are working)
```

Read each phase's SKILL.md fully before implementing. Do not skip Phase 0 — every
later phase depends on the Asset Library schema defined there.

Phase 1 has been upgraded to v2 (the "Director's Blueprint" — adds audio/music
profiling alongside visual analysis). The original v1 file is kept in that folder
as `SKILL_v1_original.md` for reference only; implement from `SKILL.md`.

Phase 4's `PATCH-audio-energy.md` adds audio-energy-spike detection on top of the
base chapter detection, and is also imported by Phase 5's sizzle detection. Build
the base Phase 4 first, then apply the patch — it also touches Phase 5's
`sizzle_finder.py`.

See `FUTURE-PATH.md` at the root for capabilities that were deliberately deferred
(true AI video generation for B-roll, live music generation, object-tracking-based
reframing, local VLMs) — do not build anything from that file unless a future
phase explicitly says to.
