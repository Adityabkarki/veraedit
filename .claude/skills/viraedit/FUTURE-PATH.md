# Future Path — Premium / Optional Capabilities (Do Not Build Yet)

## Purpose of this document

This captures genuinely good ideas from architecture discussions that are **not**
part of the current build (Phases 0-9). They are explicitly deferred because they
would either break the core product promise — fast, cheap, one-click — or because
the underlying APIs aren't yet reliable/available enough to depend on for a
production feature.

Cursor should **not** implement anything in this document unless a future phase
explicitly references it. This file exists so the ambition is recorded and not
forgotten, without it leaking into the current build's scope.

---

## 1. True AI Video Generation for Missing B-Roll (Sora / Runway Gen-3)

**The idea:** When Phase 2's gap resolution finds a missing video slot, instead of
generating a still image and Ken-Burns-animating it (the current, shipped approach),
call Sora or Runway Gen-3 to generate genuine short video clips matching the slot's
description.

**Why it's deferred:**
- **Cost**: these are priced per-second-of-generated-video at a rate dramatically
  higher than a single Gemini image generation call (cents vs. potentially dollars
  per clip). This would blow up the AI Spend Meter (Phase 7) in ways that make the
  product feel expensive rather than magical.
- **Latency**: generation typically takes minutes, not seconds — this breaks the
  one-click, fast-feedback flow that Phase 6 is built around.
- **API availability**: Sora's API access has been limited/gated; Runway Gen-3
  access and rate limits are not yet stable enough to depend on for every user's
  gap-filling flow.

**When to revisit:** Once pricing drops meaningfully and latency gets to
sub-30-seconds for short clips, this could become an optional "Premium B-roll
generation" toggle — explicitly slower and costlier, opt-in, with the cost shown
upfront before the user commits (consistent with Phase 7's transparency principle).
The still-image-to-Ken-Burns approach should remain the default even after this
ships, not be replaced by it.

---

## 2. Live Custom Music Generation (Suno / Udio / AudioCraft)

**The idea:** Instead of picking from a bundled, mood-tagged royalty-free music
library (the current, shipped Phase 5 approach), generate a custom track matching
the exact duration and emotional arc of each specific video.

**Why it's deferred:**
- **Speed**: generation takes real time (often 30s-2min), again breaking the
  fast-feedback loop.
- **Cost**: per-generation API costs are non-trivial at scale compared to a
  one-time-licensed bundled library that costs nothing per use.
- **Reliability of duration-matching**: getting a generated track to match an
  exact target duration with a specific emotional arc reliably is still an
  emerging capability, not a solved problem — the bundled library guarantees
  predictable results today.

**When to revisit:** As an optional "Generate custom music for this video" button
alongside the default bundled-library picker, clearly marked as slower and
costing more, shown via the AI Spend Meter before the user confirms. Never as
the default path.

---

## 3. Object-Tracking-Based Reframing (YOLOv8 + Segment Anything 2)

**The idea:** Replace MediaPipe face-tracking (current, shipped Phase 7 approach,
hardened further in Phase 8) with full object detection + segmentation to track
not just faces but the primary subject/action in any shot — better for sports,
product demos, or action footage where the "subject" isn't a face.

**Why it's deferred:**
- The primary use case for this product (podcasters, consultants, small business
  owners) is overwhelmingly talking-head and screen-recording content, where
  face-tracking already performs well once Phase 8's hardening (full-range model,
  detection-ratio fallback) is in place.
- YOLOv8 + SAM2 is meaningfully heavier compute (slower processing, higher VPS
  resource requirements) for a benefit that mostly matters for content types
  this product's actual users rarely produce.

**When to revisit:** If usage data from real workspaces shows a meaningful
fraction of source videos are action/sports/product-demo content where
face-tracking's `detection_ratio < 0.3` fallback (Phase 8) is triggering often,
that's the signal to invest in this. Treat it as a Phase 8-style fine-tuning
upgrade specifically for that content category, not a general replacement.

---

## 4. Local/Self-Hosted Vision-Language Models (LLaVA, etc.)

**The idea:** Use a locally-run open vision-language model instead of Gemini for
visual analysis tasks, reducing per-call API costs.

**Why it's deferred:**
- The `.env` and Phase 0-9 architecture already standardizes on Gemini for vision
  reasoning and OpenAI for text reasoning, with Ollama as the existing budget-
  triggered fallback (Phase 7's `should_use_local()`). Introducing a third model
  family (a locally-hosted VLM) adds meaningful infrastructure complexity —
  GPU/compute requirements on the Rocky Linux 9 VPS, model serving, version
  management — without a clear quality or cost win over Gemini 2.0 Flash, which
  is already inexpensive for this use case.
- The existing Ollama fallback (text-only, used when budget caps are hit) already
  serves the "reduce cost under pressure" need without adding a second vision
  pipeline to maintain.

**When to revisit:** Only if Gemini API costs or rate limits become a genuine
bottleneck at scale, and only after evaluating whether a hosted local VLM can
match Gemini's video-understanding quality (Phase 1's "Director's Blueprint"
depends heavily on this quality bar) — this is a high-risk swap to make
prematurely.

---

## Guiding Principle for All Future Additions

Every idea in this document shares the same shape: **slower, more expensive, but
potentially higher-ceiling** than what's currently shipped. The discipline for
adopting any of them is the same:

1. It must be opt-in, never the default — the current fast/cheap/one-click paths
   (Phases 0-9) remain the primary experience.
2. Its cost must be shown via the AI Spend Meter (Phase 7) before the user commits,
   not after.
3. It should be introduced as an addition alongside the existing approach, not a
   replacement, until real usage data justifies otherwise.
4. If it can't run within the existing AI budget/fallback framework (Phase 7's
   `ai_budget.py`), it isn't ready to ship yet.
