 
## Role & Mandate
 
You are the lead engineer closing out ViraEdit's core promise: **a non-editor uploads a video and gets a finished, automatically-edited result — no manual timeline work.** Most of the architecture exists. What's missing is coverage (not enough motion graphics/SFX/elements to make an edit feel complete), some unverified wiring, and — based on this project's history — a habit of marking things "done" that don't hold up against a real exported file. Fix that habit first. Everything else follows from it.
 
**Before writing any code:** read `skills.md` in full, and read all 14 files in `/ai-docs/master-prompts/` for context on what's already been decided and why. Do not re-litigate existing laws (Determinism, Preview/Export Parity, Director Timeline Primacy, Fallback Guarantee, Trigger-Driven Assembly, Honest Confidence). Extend and enforce them; don't rediscover them from scratch.
 
**The one rule that overrides everything else:** nothing is "done" until you have opened the actual exported video file (not logs, not the compiled JSON, not a preview) and confirmed with your own inspection that what you claim is true is actually there. This project has repeatedly had status reports claim completeness that a real test then contradicted (the four-engine report, the render bridge, the effects/style/B-roll trio). Do not repeat that pattern. When you report progress, structure it exactly like this: **Verified** (you personally inspected the real output and confirmed it) vs. **Implemented but unverified** (code exists, hasn't been checked against real output) vs. **Not done**. Never round the second category up to the first.
 
---
 
## The Finish Line (read this before starting anything)
 
Two concrete, provable outcomes — not a general improvement pass:
 
1. **One real short-form/Reel-length video (under ~90 seconds), uploaded and exported through the app with zero manual editing, is genuinely rich** — dense, accurate motion graphics, real SFX synced to cuts/beats, real B-roll where appropriate, kinetic captions, correct grade, all from the applied style template. This is the flagship proof point. It should look like a human editor with taste made it, not like an AI tried.
2. **One real long-form video (a 30–60 minute podcast or consultancy recording), uploaded and exported through the app with zero manual editing, is genuinely complete** — it does not need to be rich. Simpler is explicitly acceptable here: fewer motion graphic types, sparser B-roll, plainer captions. What it must NOT be is broken, empty, or missing whole tracks (no motion graphics at all, no captions, silent audio gaps). "Simple but whole" is the bar, not "impressive."
If you have to make a tradeoff between polishing long-form richness and nailing short-form richness, **choose short-form richness every time** — that's explicitly the priority. Long-form only needs to clear "complete," not "impressive."
 
Do not consider this mission finished until both of these have been produced as real files, inspected, and reported on honestly.
 
---
 
## Phase 1 — Honest Audit (do this before building anything)
 
1. Verify the render bridge fix (`viraedit-bugfix-preview-export-parity.md`, `viraedit-bugfix-director-primacy.md`) actually holds — export a real test project and confirm motion graphics/VFX/SFX/grade are genuinely present in the output file. Do not assume this is fixed because a prior session said so.
2. Run the Coverage Audit from `viraedit-production-completeness-master-prompt.md` Phase 1 if it hasn't been run, or re-verify it if it has — trigger type by trigger type, is there a real, rendering component behind it, or a gap?
3. Extend that audit explicitly to **SFX** and **generic elements** (icon sets, badges, annotation shapes) — the original spec covered motion graphics coverage; SFX and elements need the same rigor now.
4. Extend the audit to the **Style Template system** — confirm cloned/applied styles reach grade and motion personality, not just colors and fonts (Style Depth Law).
5. Produce one gap list, ranked by how often each gap actually fires on real content — not by how interesting it is to build.
⏸️ Report the gap list before proceeding. Be specific: name the trigger type, whether a component exists, and whether it's actually mounted in the real export path.
 
---
 
## Phase 2 — Library Expansion, Prioritized for Short-Form Richness
 
Build out whatever the Phase 1 audit shows is missing, in this order:
 
**First priority — Social/Reel pillar (this is what "great job" means for reel-time video):**
- Any missing kinetic typography variants, icon/element animations, doodle/scribble annotation shapes, glitch/VFX overlays, subscribe/CTA badge styles, and transition types called for in the original Motion Graphics wishlist but never built.
- Expand the SFX library meaningfully: multiple whoosh variants (different transition speeds/directions), pop/click variants for different emphasis levels, risers, chimes — enough variety that the same three sounds don't repeat obviously across one video. Every SFX still ties to a real `TriggerLogEntry`/`TransitionEntry` per the SFX Attribution Law — no decorative, untraceable sound.
- Confirm every new component respects the existing Layer Depth Registry bands, Devanagari Padding Law, and reads from `ThemeToken`/`GradeToken` — don't let speed here compromise those laws.
**Second priority — long-form fallback completeness (simple is fine, but must exist):**
- The fallback components from the Production Completeness spec (Topic Title Card, Pull-Quote Card, Bullet/List Reveal, Comparison Table) — build these if they aren't built yet. These are what keep a 45-minute podcast from having dead, static stretches, without needing to be elaborate.
⏸️ Verify each new component renders correctly in isolation before wiring it into Director rules.
 
---
 
## Phase 3 — Style Template Accuracy
 
1. Fix whatever Phase 1 found regarding style depth — grade, motion curve, and B-roll search-mood bias must all derive from the applied/cloned style, not just color and font.
2. Test this specifically on the short-form flagship video: apply a style template and confirm the exported clip's pacing, grade, and visual mood actually reflect it, not just its color palette.
⏸️ Confirm with a real before/after comparison — same source clip, two different style templates applied, visibly and audibly different results beyond color.
 
---
 
## Phase 4 — Wire, Don't Assume
 
Confirm the full chain actually runs end to end with no manual steps: upload → transcription/diarization → Director signal extraction → trigger resolution with the now-expanded component/SFX library → compile → render bridge (the real one, per Phase 1) → completeness gate (from the Production Completeness spec, if built) → export.
 
⏸️ Do not proceed to Phase 5 until you've traced this chain in the actual code and confirmed every step calls the next — not assumed it based on file names or prior documentation.
 
---
 
## Phase 5 — Prove It
 
1. Take one real short-form test video. Upload it. Do not touch the timeline manually. Export it. Open the actual file. Watch it. Report exactly what you see: how many motion graphics, what SFX played and where, whether B-roll appeared appropriately, whether captions were clean and correctly timed, whether the style template's influence was visible in grade and pacing — not just "it exported successfully."
2. Take one real long-form test video (30–60 min). Same process. Report honestly: is it complete (every stretch has something happening, captions throughout, no dead audio), even if simple? Or are there still gaps?
3. If either fails, name exactly what's missing and treat it as the next concrete task — don't broaden into new features to compensate.
⏸️ This phase is the actual deliverable. Everything before it is in service of this.
 
---
 
## Phase 6 — Final Honest Status Report
 
Using the Verified / Implemented-but-unverified / Not-done framing from the top of this document, report:
- What's genuinely production-ready right now, for which content type(s).
- What still requires manual work, specifically.
- What you'd tackle next if this continued.
Update `motion-graphics.md` and `director-engine.md` with everything shipped in this pass.
 
---
 
## Constraints
 
- Don't rebuild what already works. Extend the existing library and pipeline; don't rearchitect.
- Short-form richness beats long-form richness if you have to choose where to spend effort.
- "Simple but complete" is an acceptable, explicitly desired outcome for long-form. "Broken but ambitious" is not acceptable anywhere.
- A claim without an inspected real file behind it is not a finished task.
 