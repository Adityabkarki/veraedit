# Phase 10 — Style Extractor Fix
## Part 2 of 3: Gap Report UI + EP-10.4 Renderers

> Prerequisite: Part 1 (Capability Registry) must be implemented first.
> The UI changes here read `coverage_pct` and `gap_report` that Part 1 produces.
> The renderer functions here are the dispatcher targets Part 1 calls.

---

## Section A: Gap Report UI

### Problem with the current card

The template library card shows "100% supported" from an undefined computation.
After Part 1, every preset has a real `coverage_pct` and a structured `gap_report`
in its stored data. This section wires that into the UI.

### `StyleTransferTab` — update `presetSummary()`

Find the existing `presetSummary()` function in `StyleTransferTab` (or wherever
the card string "5 edits detected · 25s reference · vision · Lower-thirds..." is
assembled) and replace the flat summary logic:

```typescript
// apps/web/src/components/editor/StyleTransferTab.tsx

interface GapReportItem {
  toolbox_id: string;
  display_name: string;
  category: string;
  status: 'supported' | 'partial' | 'unsupported';
  renderer?: string;
  partial_reason?: string;
}

interface GapReport {
  total_detected: number;
  implemented: GapReportItem[];
  partial: GapReportItem[];
  unresolvable: GapReportItem[];
  coverage_pct: number;
}

// Replace the flat "100% supported" badge with this component:
function CoverageChip({ coverage }: { coverage: number }) {
  const color =
    coverage >= 80 ? 'bg-green-100 text-green-700' :
    coverage >= 50 ? 'bg-yellow-100 text-yellow-700' :
                     'bg-red-100 text-red-700';
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${color}`}>
      {coverage}% will apply
    </span>
  );
}

// Replace the flat effects labels list with this:
function EffectsList({ gapReport }: { gapReport: GapReport }) {
  return (
    <div className="space-y-0.5 mt-1">
      {gapReport.implemented.map(item => (
        <div key={item.toolbox_id} className="flex items-center gap-1.5 text-[10px]">
          <span className="text-green-500">✓</span>
          <span className="text-gray-700">{item.display_name}</span>
        </div>
      ))}
      {gapReport.partial.map(item => (
        <div key={item.toolbox_id} className="flex items-center gap-1.5 text-[10px]">
          <span className="text-yellow-500">~</span>
          <span className="text-gray-500">{item.display_name}</span>
          <span className="text-gray-400">(coming soon)</span>
        </div>
      ))}
      {gapReport.unresolvable.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[10px]">
          <span className="text-red-400">✗</span>
          <span className="text-gray-400 line-through">{item.raw_description}</span>
        </div>
      ))}
    </div>
  );
}
```

### Updated template library card

```tsx
// In the template library card component (wherever presets are rendered as cards)
function TemplateCard({ preset, onApply }: { preset: Preset; onApply: () => void }) {
  const gapReport: GapReport = preset.effect_inventory?.gap_report;
  const coverage = preset.effect_inventory?.coverage_pct ?? 0;
  const editCount = preset.edit_recipe?.events?.length ?? 0;
  const duration = Math.round(preset.edit_recipe?.reference_duration_s ?? 0);

  return (
    <div className="border rounded-xl p-3 space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold">{preset.name}</p>
          <p className="text-[10px] text-gray-400">
            {editCount} edit{editCount !== 1 ? 's' : ''} detected
            {' · '}{duration}s reference
            {preset.edit_recipe?.vision_used ? ' · vision' : ''}
          </p>
        </div>
        <CoverageChip coverage={coverage} />
      </div>

      {/* Per-effect list */}
      {gapReport && <EffectsList gapReport={gapReport} />}

      {/* Warning if coverage is low */}
      {coverage < 50 && (
        <p className="text-[10px] text-yellow-700 bg-yellow-50 rounded p-1.5">
          Less than half of the detected effects can be applied automatically.
          You can still apply what's supported and add the rest manually.
        </p>
      )}

      {/* Source link */}
      {preset.source_url && (
        <a href={preset.source_url} target="_blank" rel="noopener noreferrer"
          className="text-[10px] text-blue-500 underline block">
          Source ↗
        </a>
      )}

      {/* Apply controls */}
      <div className="flex items-center gap-2 pt-1">
        <div className="flex-1">
          <label className="text-[10px] text-gray-500 block mb-0.5">
            Strength {Math.round((preset.strength ?? 0.85) * 100)}%
          </label>
          <input type="range" min={0} max={100}
            defaultValue={Math.round((preset.strength ?? 0.85) * 100)}
            className="w-full h-1 accent-blue-600"
            onChange={e => preset.strength = parseInt(e.target.value) / 100}
          />
        </div>
        <button onClick={onApply}
          className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg whitespace-nowrap">
          Apply template
        </button>
      </div>
    </div>
  );
}
```

### Apply confirmation panel (shown before apply executes)

```tsx
// Show before RecipeApplicator runs, so the user knows what will happen
function ApplyConfirmPanel({
  gapReport, strength, onConfirm, onCancel
}: {
  gapReport: GapReport;
  strength: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Filter to effects that will actually be applied at this strength
  // (in practice, strength gates on confidence from the recipe event;
  //  for the preview we show all implemented effects as "will apply")
  const willApply = gapReport.implemented;
  const willSkip = [...gapReport.partial, ...gapReport.unresolvable];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
        <h3 className="font-semibold text-sm">What will be applied</h3>

        {willApply.length > 0 && (
          <div>
            <p className="text-[10px] text-green-700 font-medium uppercase tracking-wide mb-1">
              Will apply ({willApply.length})
            </p>
            {willApply.map(item => (
              <div key={item.toolbox_id} className="flex items-center gap-2 py-0.5">
                <span className="text-green-500 text-xs">✓</span>
                <span className="text-xs text-gray-700">{item.display_name}</span>
              </div>
            ))}
          </div>
        )}

        {willSkip.length > 0 && (
          <div>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">
              Cannot apply ({willSkip.length})
            </p>
            {gapReport.partial.map(item => (
              <div key={item.toolbox_id} className="flex items-center gap-2 py-0.5">
                <span className="text-yellow-400 text-xs">~</span>
                <span className="text-xs text-gray-400">{item.display_name} — not supported yet</span>
              </div>
            ))}
            {gapReport.unresolvable.map((item, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <span className="text-red-300 text-xs">✗</span>
                <span className="text-xs text-gray-400 line-through">{item.raw_description}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={onCancel}
            className="flex-1 text-xs border border-gray-300 py-2 rounded-lg">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex-1 text-xs bg-blue-600 text-white py-2 rounded-lg font-medium">
            Apply {willApply.length} effect{willApply.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Section B: EP-10.4 Renderers — The Three Missing Ones

These are the renderer methods that Part 1's dispatcher calls. They live in
`RecipeApplicator` (or a renderer mixin class if the file is large).

### Renderer 1: `_apply_remotion_lower_third`

```python
# apps/api/app/services/recipe_applicator.py

async def _apply_remotion_lower_third(self, event: dict, params: dict, work_dir: str):
    """
    Renders an animated lower-third name card using the Remotion service
    (Phase 9). The text content comes from the user's project data (speaker
    name, brand name, etc.) — NOT copied from the reference video.
    Falls back to a FFmpeg drawtext version if Remotion is unreachable.
    """
    from .remotion_client import render_lower_third_overlay, composite_overlay_onto_video
    from .capability_registry import get_capability

    text = self._resolve_placeholder_text(event, default="Your name")
    start_s = event["start_s"]
    end_s = event.get("end_s", start_s + params.get("duration_s", 4.0))
    total_duration = self._get_current_duration()

    try:
        overlay_path = await render_lower_third_overlay(
            text=text,
            start_seconds=start_s,
            end_seconds=end_s,
            total_duration=total_duration,
            font_family=self._get_brand_font(),
            brand_color=self._get_brand_color(),
            animation=params.get("animation", "slide_up"),
            output_dir=work_dir,
        )
        self.current_video_path = composite_overlay_onto_video(
            self.current_video_path, overlay_path,
            os.path.join(work_dir, f"lt_{event['slot_id']}.mp4")
        )
        self._record_applied("lower_third", {"text": text, "start_s": start_s})

    except Exception as e:
        # Fallback: FFmpeg drawtext at the bottom-left
        self._apply_ffmpeg_text_fallback(
            text=text, start_s=start_s, end_s=end_s,
            x="80", y="main_h-120", work_dir=work_dir
        )
        self._log(f"lower_third: Remotion unavailable, used FFmpeg fallback: {e}")


def _apply_ffmpeg_text_fallback(self, text: str, start_s: float, end_s: float,
                                  x: str, y: str, work_dir: str):
    """Basic FFmpeg drawtext fallback when Remotion is unavailable."""
    import subprocess
    escaped = text.replace("'", "\\'").replace(":", "\\:")
    out_path = os.path.join(work_dir, f"text_fallback_{int(start_s*100)}.mp4")
    subprocess.run([
        self.ffmpeg_path, "-i", self.current_video_path,
        "-vf", (
            f"drawtext=text='{escaped}'"
            f":fontcolor=white:fontsize=40"
            f":box=1:boxcolor=black@0.5:boxborderw=10"
            f":x={x}:y={y}"
            f":enable='between(t,{start_s},{end_s})'"
        ),
        "-c:a", "copy", out_path, "-y",
    ], check=True, capture_output=True)
    self.current_video_path = out_path
```

### Renderer 2: `_apply_remotion_title_card` (hook text + CTA)

```python
async def _apply_remotion_title_card(self, event: dict, params: dict, work_dir: str):
    """
    Renders hook text overlay or CTA overlay using the Remotion service.
    Both share the same TitleCardComposition in Phase 9's Remotion setup.
    """
    from .remotion_client import render_title_card_overlay, composite_overlay_onto_video

    text = self._resolve_placeholder_text(event, default="Your hook headline")
    start_s = event["start_s"]
    end_s = event.get("end_s", start_s + 3.0)
    total_duration = self._get_current_duration()

    # Zone indicates where in the video this lands (hook/body/cta)
    # used by timing logic in Part 3 — passed through here transparently
    zone = params.get("zone", "body")

    try:
        overlay_path = await render_title_card_overlay(
            text=text,
            start_seconds=start_s,
            end_seconds=end_s,
            total_duration=total_duration,
            font_family=self._get_brand_font(),
            brand_color=self._get_brand_color(),
            position=params.get("position", "center_top"),
            animation=params.get("animation", "slide_down"),
            output_dir=work_dir,
        )
        self.current_video_path = composite_overlay_onto_video(
            self.current_video_path, overlay_path,
            os.path.join(work_dir, f"tc_{zone}_{int(start_s*100)}.mp4")
        )
        self._record_applied("title_card", {"text": text, "zone": zone, "start_s": start_s})

    except Exception as e:
        self._apply_ffmpeg_text_fallback(
            text=text, start_s=start_s, end_s=end_s,
            x="(main_w-text_w)/2", y="main_h*0.12", work_dir=work_dir
        )
        self._log(f"title_card: Remotion unavailable, used FFmpeg fallback: {e}")
```

### Renderer 3: `_apply_ffmpeg_transition`

```python
def _apply_ffmpeg_transition(self, event: dict, params: dict,
                               source_video_path: str, work_dir: str):
    """
    Applies a transition effect at the cut point nearest to event["start_s"].
    Three types are implemented: zoom, crossfade, whip_pan, hard_cut (no-op).
    """
    import subprocess

    filter_type = params.get("filter", "none")
    snap_time = self._snap_to_nearest_cut(event["start_s"])
    duration_s = params.get("duration_s", 0.25)
    duration_frames = params.get("duration_frames", 6)

    if filter_type == "none":
        # Hard cut: no FFmpeg work needed, it's already a cut
        self._record_applied("transition_hard_cut", {"at_s": snap_time})
        return

    out_path = os.path.join(work_dir, f"trans_{filter_type}_{int(snap_time*100)}.mp4")

    if filter_type == "xfade":
        # Split at cut point, apply xfade between the two halves
        total_dur = self._get_current_duration()
        part_a = os.path.join(work_dir, "xfade_a.mp4")
        part_b = os.path.join(work_dir, "xfade_b.mp4")

        subprocess.run([
            self.ffmpeg_path, "-i", self.current_video_path,
            "-t", str(snap_time + duration_s / 2),
            "-c", "copy", part_a, "-y",
        ], check=True, capture_output=True)

        subprocess.run([
            self.ffmpeg_path, "-i", self.current_video_path,
            "-ss", str(snap_time - duration_s / 2),
            "-c", "copy", part_b, "-y",
        ], check=True, capture_output=True)

        subprocess.run([
            self.ffmpeg_path, "-i", part_a, "-i", part_b,
            "-filter_complex",
            f"[0:v][1:v]xfade=transition={params.get('transition_type','fade')}"
            f":duration={duration_s}:offset={snap_time - duration_s / 2}[v];"
            f"[0:a][1:a]acrossfade=d={duration_s}[a]",
            "-map", "[v]", "-map", "[a]",
            out_path, "-y",
        ], check=True, capture_output=True)

    elif filter_type == "zoompan":
        # Apply a brief zoom around the cut point using zoompan filter
        fps = 30
        zoom_start = max(0, snap_time - (duration_frames / fps / 2))
        zoom_dur = duration_frames / fps

        subprocess.run([
            self.ffmpeg_path, "-i", self.current_video_path,
            "-vf", (
                f"zoompan="
                f"z='if(between(t,{zoom_start},{zoom_start+zoom_dur}),"
                f"zoom+0.03,max(1,zoom-0.04))':"
                f"d=1:s={self.output_width}x{self.output_height}"
            ),
            "-c:a", "copy", out_path, "-y",
        ], check=True, capture_output=True)

    elif filter_type == "motion_blur_horizontal":
        # Simulate whip pan via horizontal motion blur at cut point
        subprocess.run([
            self.ffmpeg_path, "-i", self.current_video_path,
            "-vf", (
                f"minterpolate=fps={fps}:mi_mode=blend,"
                f"tblend=all_mode=average,"
                f"setpts=PTS-STARTPTS"
            ),
            "-c:a", "copy", out_path, "-y",
        ], check=True, capture_output=True)

    else:
        self._log(f"transition: unknown filter '{filter_type}', skipping")
        return

    self.current_video_path = out_path
    self._record_applied("transition", {"type": filter_type, "at_s": snap_time})

    # Cleanup temp files
    for p in [part_a if filter_type == "xfade" else None,
              part_b if filter_type == "xfade" else None]:
        if p and os.path.exists(p):
            os.remove(p)


def _snap_to_nearest_cut(self, target_time: float, snap_window: float = 3.0) -> float:
    """
    Returns the clip boundary time nearest to target_time within snap_window seconds.
    If no clip boundary exists within snap_window, returns target_time unchanged.
    This is the existing snap logic from _apply_transition_at — refactored here
    as a standalone method so all renderers can use it.
    """
    nearest = target_time
    min_dist = snap_window

    for clip in self.timeline_clips:
        # Check clip start and end boundaries
        for boundary in [clip.get("start_s", 0), clip.get("end_s", 0)]:
            dist = abs(boundary - target_time)
            if dist < min_dist:
                min_dist = dist
                nearest = boundary

    return nearest
```

---

## Remotion Service Extensions (Phase 9 additions)

Add these endpoints to the existing Remotion service from Phase 9:

### `remotion-service/src/LowerThirdComposition.tsx`

```tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

interface LowerThirdProps {
  text: string;
  subtext?: string;
  startSeconds: number;
  endSeconds: number;
  fontFamily: string;
  brandColor: string;
  animation: "slide_up" | "fade_in";
}

export const LowerThirdComposition: React.FC<LowerThirdProps> = ({
  text, subtext, startSeconds, endSeconds, fontFamily, brandColor, animation,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  if (currentTime < startSeconds || currentTime > endSeconds) return null;

  const localFrame = frame - Math.round(startSeconds * fps);
  const exitFrame = Math.round((endSeconds - startSeconds) * fps) - Math.round(0.3 * fps);

  const enterProgress = spring({ frame: localFrame, fps, config: { damping: 15, stiffness: 180 } });
  const exitProgress = spring({ frame: Math.max(0, localFrame - exitFrame), fps,
                                 config: { damping: 20, stiffness: 300 } });

  const translateY = animation === "slide_up"
    ? interpolate(enterProgress, [0, 1], [30, 0]) - interpolate(exitProgress, [0, 1], [0, 30])
    : 0;
  const opacity = interpolate(enterProgress, [0, 1], [0, 1]) * interpolate(exitProgress, [0, 1], [1, 0]);

  return (
    <AbsoluteFill>
      <div style={{
        position: "absolute", bottom: 120, left: 60,
        transform: `translateY(${translateY}px)`, opacity,
      }}>
        <div style={{
          background: brandColor, height: 4, width: 40, marginBottom: 8, borderRadius: 2,
        }} />
        <p style={{ fontFamily, fontSize: 44, fontWeight: 700, color: "white",
                    textShadow: "0 2px 8px rgba(0,0,0,0.6)", lineHeight: 1.1 }}>
          {text}
        </p>
        {subtext && (
          <p style={{ fontFamily, fontSize: 28, fontWeight: 400, color: "rgba(255,255,255,0.8)",
                      marginTop: 4 }}>
            {subtext}
          </p>
        )}
      </div>
    </AbsoluteFill>
  );
};
```

### Add to `remotion-service/server.js`

```javascript
app.post("/render-lower-third", async (req, res) => {
  try {
    const { text, subtext, startSeconds, endSeconds, fontFamily, brandColor,
            animation, durationSeconds, width, height, outputPath } = req.body;

    const bundleLocation = await getBundle();
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "LowerThirdOverlay",
      inputProps: { text, subtext, startSeconds, endSeconds, fontFamily, brandColor, animation },
    });

    await renderMedia({
      composition: { ...composition,
                     durationInFrames: Math.ceil(durationSeconds * 30), fps: 30, width, height },
      serveUrl: bundleLocation,
      codec: "vp8",
      outputLocation: outputPath,
      inputProps: { text, subtext, startSeconds, endSeconds, fontFamily, brandColor, animation },
      pixelFormat: "yuva420p",
    });

    res.json({ success: true, outputPath });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

### Add `render_lower_third_overlay` to `remotion_client.py`

```python
async def render_lower_third_overlay(
    text: str, start_seconds: float, end_seconds: float, total_duration: float,
    font_family: str = "Montserrat", brand_color: str = "#3b82f6",
    animation: str = "slide_up", subtext: str = None, output_dir: str = None,
) -> str:
    import uuid, os
    from ..config import settings
    output_path = os.path.join(
        output_dir or settings.temp_dir,
        f"lower_third_{uuid.uuid4().hex[:8]}.webm"
    )
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(f"{REMOTION_SERVICE_URL}/render-lower-third", json={
            "text": text, "subtext": subtext,
            "startSeconds": start_seconds, "endSeconds": end_seconds,
            "fontFamily": font_family, "brandColor": brand_color,
            "animation": animation,
            "durationSeconds": total_duration,
            "width": 1080, "height": 1920,
            "outputPath": output_path,
        })
        resp.raise_for_status()
        result = resp.json()
        if not result.get("success"):
            raise RuntimeError(f"Remotion lower-third render failed: {result.get('error')}")
    return output_path
```

---

## Result Apply Summary (after apply completes)

After `RecipeApplicator.apply()` finishes, return a summary to the frontend:

```python
# apps/api/app/services/recipe_applicator.py — add apply_summary() method

def apply_summary(self) -> dict:
    """
    Returns a structured summary of what was applied, skipped, or failed.
    This is what the UI shows in the post-apply notification.
    """
    return {
        "applied": self.applied_effects,         # list of {toolbox_id, params}
        "skipped": self.skipped_effects,         # list of {toolbox_id, reason}
        "errors": self.error_effects,            # list of {toolbox_id, error}
        "applied_count": len(self.applied_effects),
        "skipped_count": len(self.skipped_effects),
    }
```

### Post-apply notification component

```tsx
// Show after apply completes in StyleTransferTab
function ApplySummaryToast({ summary }: { summary: ApplySummary }) {
  return (
    <div className="bg-white border rounded-xl p-3 shadow-lg text-xs space-y-1">
      <p className="font-medium">
        {summary.applied_count} effect{summary.applied_count !== 1 ? 's' : ''} applied
        {summary.skipped_count > 0 ? ` · ${summary.skipped_count} skipped` : ''}
      </p>
      {summary.skipped.filter(s => s.reason !== 'below_strength_threshold').map((s, i) => (
        <p key={i} className="text-gray-400">
          {s.toolbox_id} — {s.reason.replace(/_/g, ' ')}
        </p>
      ))}
    </div>
  );
}
```

---

## Checklist for Cursor — Part 2

- [ ] `StyleTransferTab`: replace flat "100% supported" with `CoverageChip` and
      `EffectsList` reading from `preset.effect_inventory.gap_report`
- [ ] `TemplateCard`: wire `coverage_pct`, `gap_report`, `edit_recipe.events.length`,
      `reference_duration_s` from the preset object — confirm exact field names in
      the existing `to_summary_dict()` output and align
- [ ] `ApplyConfirmPanel`: show before `RecipeApplicator.apply()` is called, listing
      what will and won't be applied — user must confirm before apply runs
- [ ] `RecipeApplicator._apply_remotion_lower_third` — renders lower-third via
      Remotion with `_apply_ffmpeg_text_fallback` as the fallback
- [ ] `RecipeApplicator._apply_remotion_title_card` — hook text + CTA, same pattern
- [ ] `RecipeApplicator._apply_ffmpeg_transition` — zoom, crossfade, whip_pan,
      hard_cut (no-op); uses `_snap_to_nearest_cut`
- [ ] `_snap_to_nearest_cut` extracted as a standalone method (was inline
      in `_apply_transition_at` — refactor, don't duplicate)
- [ ] `LowerThirdComposition.tsx` in Remotion service
- [ ] `/render-lower-third` endpoint in `remotion-service/server.js`
- [ ] `render_lower_third_overlay` in `remotion_client.py`
- [ ] `apply_summary()` method on `RecipeApplicator`
- [ ] `applied_effects`, `skipped_effects`, `error_effects` lists initialized
      in `RecipeApplicator.__init__`
- [ ] `ApplySummaryToast` component shown after apply completes
- [ ] All Remotion rendering calls have fallback to FFmpeg drawtext — a Remotion
      service outage must not hard-fail an apply
- [ ] The whip-pan `motion_blur_horizontal` FFmpeg implementation is an
      approximation — note this in code comments; a true whip pan requires
      interpolating adjacent frames which is expensive. The approximation is
      acceptable for v1.