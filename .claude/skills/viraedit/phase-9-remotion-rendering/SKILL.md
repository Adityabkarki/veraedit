# Phase 9 — Remotion-Based Caption & Motion Graphics Rendering

## Why this phase exists

Every prior phase that needed text on screen — captions (Module 03 originally),
title cards (Phase 6's `template_renderer.py`) — used FFmpeg's `drawtext` filter
or hand-written ASS subtitle files. This works, but it's genuinely the weakest
part of the visual output: FFmpeg text rendering is crude, animation options are
limited to what's expressible in ASS karaoke tags, and adding any new animated
typography style means writing more brittle filter-string code.

**Remotion** (a React-based programmatic video renderer) solves this properly:
captions and title cards become actual React components with full CSS animation,
rendered frame-by-frame to a video file via a render server. This is what
professional caption tools (Submagic, CapCut's animated captions, etc.) actually
use under the hood. This phase replaces the FFmpeg-text approach for anything
caption/typography-related, while **keeping FFmpeg for everything else** (cuts,
reframing, audio mixing, color, background blur) — those are genuinely FFmpeg's
strong suit and there's no reason to move them.

---

## Architecture

```
FastAPI backend
   │
   ├── Existing FFmpeg pipeline (cuts, reframe, audio, color) — UNCHANGED
   │
   └── NEW: Remotion render service (separate Node.js process)
          │
          ├── Receives: video file + caption/title timing data (JSON)
          ├── Renders: a transparent-background overlay video of just the
          │            animated text, OR a fully composited final video
          └── Returns: rendered video file path
```

Remotion runs as its own small Node.js service alongside the Python backend,
called via HTTP from FastAPI — similar pattern to how the AI service is called
from Node in a typical setup, just inverted (Python calling a Node render service).

---

## Setting Up the Remotion Service

### `remotion-service/package.json`

```json
{
  "name": "viraedit-remotion-service",
  "version": "1.0.0",
  "scripts": {
    "dev": "node server.js",
    "render": "remotion render"
  },
  "dependencies": {
    "@remotion/cli": "^4.0.0",
    "@remotion/renderer": "^4.0.0",
    "remotion": "^4.0.0",
    "express": "^4.19.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

### `remotion-service/src/CaptionComposition.tsx`

```tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

interface Word {
  word: string;
  start: number;  // seconds
  end: number;
}

interface CaptionStyleProps {
  words: Word[];
  style: "hormozi" | "mrbeast" | "minimal" | "nepali_bold" | "kinetic";
  fontFamily: string;
}

const STYLE_CONFIG = {
  hormozi:     { fontSize: 72, color: "#ffffff", highlightColor: "#FFD600", stroke: "#000000", strokeWidth: 8, position: "bottom" as const },
  mrbeast:     { fontSize: 84, color: "#FFD600", highlightColor: "#FF0000", stroke: "#000000", strokeWidth: 10, position: "center" as const },
  minimal:     { fontSize: 52, color: "#ffffff", highlightColor: "#ffffff", stroke: "rgba(0,0,0,0.5)", strokeWidth: 3, position: "bottomQuarter" as const },
  nepali_bold: { fontSize: 68, color: "#ffffff", highlightColor: "#FFD600", stroke: "#000000", strokeWidth: 8, position: "bottom" as const },
  kinetic:     { fontSize: 76, color: "#ffffff", highlightColor: "#FF6B00", stroke: "#FF6B00", strokeWidth: 6, position: "center" as const },
};

export const CaptionComposition: React.FC<CaptionStyleProps> = ({ words, style, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;
  const config = STYLE_CONFIG[style];

  // Find the active group of words (group by ~3 words at a time, matching
  // the original ASS-based grouping logic from the FFmpeg approach)
  const activeWord = words.find(w => currentTime >= w.start && currentTime < w.end);
  if (!activeWord) return null;

  const groupSize = style === "minimal" ? 5 : 3;
  const activeIndex = words.indexOf(activeWord);
  const groupStart = Math.floor(activeIndex / groupSize) * groupSize;
  const group = words.slice(groupStart, groupStart + groupSize);

  const positionStyles = {
    bottom:        { bottom: "15%", top: "auto" },
    center:        { top: "50%", transform: "translateY(-50%)" },
    bottomQuarter: { bottom: "10%", top: "auto" },
  };

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 0 }}>
      <div style={{
        position: "absolute", left: "50%", transform: "translateX(-50%)",
        ...positionStyles[config.position],
        display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.3em",
        maxWidth: "85%", padding: "0 20px",
      }}>
        {group.map((w, i) => {
          const isActive = w === activeWord;
          const wordIndexInVideo = groupStart + i;

          // Entrance animation: each word springs in as it becomes active
          const enterProgress = spring({
            frame: frame - Math.round(w.start * fps),
            fps,
            config: { damping: 12, stiffness: 200 },
          });

          const scale = isActive ? interpolate(enterProgress, [0, 1], [0.8, 1.08]) : 1;
          const opacity = currentTime >= w.start ? 1 : 0.35;

          return (
            <span
              key={wordIndexInVideo}
              style={{
                fontFamily,
                fontSize: config.fontSize,
                fontWeight: 800,
                color: isActive ? config.highlightColor : config.color,
                WebkitTextStroke: `${config.strokeWidth}px ${config.stroke}`,
                paintOrder: "stroke fill",
                transform: `scale(${scale})`,
                opacity,
                transition: "color 0.1s",
                display: "inline-block",
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
```

### `remotion-service/src/TitleCardComposition.tsx`

```tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

interface TitleCardProps {
  text: string;
  startSeconds: number;
  endSeconds: number;
  fontFamily: string;
  brandColor: string;
}

export const TitleCardComposition: React.FC<TitleCardProps> = ({
  text, startSeconds, endSeconds, fontFamily, brandColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  if (currentTime < startSeconds || currentTime > endSeconds) return null;

  const localFrame = frame - Math.round(startSeconds * fps);
  const enter = spring({ frame: localFrame, fps, config: { damping: 14 } });
  const translateY = interpolate(enter, [0, 1], [40, 0]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);

  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: "12%" }}>
      <div style={{
        fontFamily, fontSize: 64, fontWeight: 800, color: "#fff",
        background: `${brandColor}cc`, padding: "16px 32px", borderRadius: 16,
        transform: `translateY(${translateY}px)`, opacity, textAlign: "center", maxWidth: "85%",
      }}>
        {text}
      </div>
    </AbsoluteFill>
  );
};
```

### `remotion-service/server.js`

```javascript
const express = require("express");
const { bundle } = require("@remotion/bundler");
const { renderMedia, selectComposition } = require("@remotion/renderer");
const path = require("path");

const app = express();
app.use(express.json({ limit: "10mb" }));

let bundleCache = null;
async function getBundle() {
  if (!bundleCache) {
    bundleCache = await bundle(path.join(__dirname, "src/index.ts"));
  }
  return bundleCache;
}

// Renders a transparent overlay video containing ONLY the animated captions,
// matched to the duration/dimensions of the target video. The caller (FastAPI)
// then composites this overlay onto the actual footage via a single FFmpeg
// overlay pass — keeping FFmpeg responsible for final compositing, Remotion
// responsible only for generating the polished animated text layer.
app.post("/render-captions", async (req, res) => {
  try {
    const { words, style, fontFamily, durationSeconds, width, height, outputPath } = req.body;

    const bundleLocation = await getBundle();
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "CaptionOverlay",
      inputProps: { words, style, fontFamily },
    });

    await renderMedia({
      composition: {
        ...composition,
        durationInFrames: Math.ceil(durationSeconds * 30),
        fps: 30,
        width, height,
      },
      serveUrl: bundleLocation,
      codec: "vp8",  // supports alpha/transparency for overlay compositing
      outputLocation: outputPath,
      inputProps: { words, style, fontFamily },
      pixelFormat: "yuva420p",
    });

    res.json({ success: true, outputPath });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/render-title-card", async (req, res) => {
  try {
    const { text, startSeconds, endSeconds, fontFamily, brandColor,
            durationSeconds, width, height, outputPath } = req.body;

    const bundleLocation = await getBundle();
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "TitleCardOverlay",
      inputProps: { text, startSeconds, endSeconds, fontFamily, brandColor },
    });

    await renderMedia({
      composition: { ...composition, durationInFrames: Math.ceil(durationSeconds * 30), fps: 30, width, height },
      serveUrl: bundleLocation,
      codec: "vp8",
      outputLocation: outputPath,
      inputProps: { text, startSeconds, endSeconds, fontFamily, brandColor },
      pixelFormat: "yuva420p",
    });

    res.json({ success: true, outputPath });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3500, () => console.log("Remotion render service on :3500"));
```

### `remotion-service/src/index.ts`

```tsx
import { Composition } from "remotion";
import { CaptionComposition } from "./CaptionComposition";
import { TitleCardComposition } from "./TitleCardComposition";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="CaptionOverlay"
      component={CaptionComposition}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ words: [], style: "hormozi", fontFamily: "Montserrat" }}
    />
    <Composition
      id="TitleCardOverlay"
      component={TitleCardComposition}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ text: "", startSeconds: 0, endSeconds: 3, fontFamily: "Montserrat", brandColor: "#3b82f6" }}
    />
  </>
);
```

---

## Python Side: Calling the Remotion Service

### `backend/app/processors/remotion_client.py`

```python
import httpx, os, uuid
from ..config import settings

REMOTION_SERVICE_URL = "http://localhost:3500"  # internal service, not exposed publicly


async def render_caption_overlay(words: list, style: str, duration: float,
                                  width: int = 1080, height: int = 1920,
                                  font_family: str = "Montserrat") -> str:
    """
    Calls the Remotion service to render a transparent WebM overlay containing
    the animated captions only. Returns local file path to the overlay.
    """
    output_path = os.path.join(settings.temp_dir, f"caption_overlay_{uuid.uuid4().hex[:8]}.webm")

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(f"{REMOTION_SERVICE_URL}/render-captions", json={
            "words": words, "style": style, "fontFamily": font_family,
            "durationSeconds": duration, "width": width, "height": height,
            "outputPath": output_path,
        })
        resp.raise_for_status()
        result = resp.json()
        if not result.get("success"):
            raise RuntimeError(f"Remotion caption render failed: {result.get('error')}")

    return output_path


async def render_title_card_overlay(text: str, start: float, end: float,
                                     total_duration: float, brand_color: str = "#3b82f6",
                                     width: int = 1080, height: int = 1920,
                                     font_family: str = "Montserrat") -> str:
    output_path = os.path.join(settings.temp_dir, f"title_overlay_{uuid.uuid4().hex[:8]}.webm")

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(f"{REMOTION_SERVICE_URL}/render-title-card", json={
            "text": text, "startSeconds": start, "endSeconds": end,
            "fontFamily": font_family, "brandColor": brand_color,
            "durationSeconds": total_duration, "width": width, "height": height,
            "outputPath": output_path,
        })
        resp.raise_for_status()
        result = resp.json()
        if not result.get("success"):
            raise RuntimeError(f"Remotion title card render failed: {result.get('error')}")

    return output_path


def composite_overlay_onto_video(base_video_path: str, overlay_path: str, output_path: str) -> str:
    """
    Final FFmpeg compositing step: overlays the transparent Remotion-rendered
    WebM onto the base footage. This is the ONE place FFmpeg and Remotion meet —
    FFmpeg still owns final video assembly, Remotion only produced the text layer.
    """
    import subprocess
    subprocess.run([
        settings.ffmpeg_path, "-i", base_video_path, "-i", overlay_path,
        "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto",
        "-c:a", "copy",
        output_path, "-y",
    ], check=True, capture_output=True)
    return output_path
```

---

## Replacing the Old Caption Renderer Call Sites

### `backend/app/processors/caption_renderer.py` — new entry point

```python
# Add this new function alongside the existing ASS-based render_captions
# (keep the old one temporarily as a fallback in case the Remotion service
# is unreachable — see fallback pattern below)

from .remotion_client import render_caption_overlay, composite_overlay_onto_video
from .text_editor import _get_duration

async def render_captions_v2(input_path: str, output_path: str, words: list,
                              style: str = "hormozi", font_family: str = "Montserrat") -> str:
    """
    Remotion-based caption rendering — replaces the ASS/FFmpeg drawtext approach
    for all NEW caption rendering going forward. Falls back to the original
    ASS-based render_captions() if the Remotion service is unreachable, so a
    render service outage doesn't hard-fail every video in the pipeline.
    """
    duration = _get_duration(input_path)

    try:
        overlay_path = await render_caption_overlay(words, style, duration, font_family=font_family)
        composite_overlay_onto_video(input_path, overlay_path, output_path)
        if os.path.exists(overlay_path):
            os.remove(overlay_path)
        return output_path
    except Exception:
        # Fallback to the original ASS-based approach — keep render_captions()
        # from the original Module 03 implementation in this file for this purpose
        return render_captions(input_path, output_path, words, style=style)
```

All call sites across Phases 3, 4, 5, and 6 that currently call `render_captions(...)`
should be updated to call `render_captions_v2(...)` (it's now `async`, so calling
code needs `await` or `asyncio.run()` as appropriate for its context).

---

## Deployment: Adding the Remotion Service to Docker/Systemd

```ini
# /etc/systemd/system/viraedit-remotion.service
[Unit]
Description=ViraEdit Remotion Render Service
After=network.target

[Service]
Type=simple
User=mkarki
WorkingDirectory=/home/mkarki/viraedit/remotion-service
Environment="PATH=/usr/bin:/usr/local/bin"
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
cd remotion-service
npm install
sudo systemctl daemon-reload
sudo systemctl enable viraedit-remotion
sudo systemctl start viraedit-remotion
```

---

## Why Keep FFmpeg for Everything Else

To be explicit about scope: this phase does **not** move cuts, reframing, color
correction, audio mixing, or background blur to Remotion. Remotion is for
animated typography specifically — it would be slower and more complex for raw
video manipulation than FFmpeg, which remains the right tool for those jobs
across all earlier phases. This is an additive, narrowly-scoped upgrade.

---

## Checklist for Cursor

- [ ] `remotion-service/` — new Node.js project with `package.json`, `server.js`,
      `src/index.ts`, `CaptionComposition.tsx`, `TitleCardComposition.tsx`
- [ ] `npm install` in `remotion-service/` to pull Remotion dependencies
- [ ] `backend/app/processors/remotion_client.py` — HTTP client calling the
      Remotion service, plus the FFmpeg compositing step
- [ ] `caption_renderer.py` — add `render_captions_v2` with fallback to the
      original ASS-based `render_captions` on Remotion service failure
- [ ] Update all call sites in Phases 3 (shorts), 4 (chapters), 5 (sizzle), and
      6 (template render) from `render_captions(...)` to `await render_captions_v2(...)`
- [ ] Systemd service for the Remotion render process (`viraedit-remotion.service`)
- [ ] Nginx/firewall: confirm port 3500 is NOT exposed externally — it's an
      internal service only the FastAPI backend should reach
- [ ] Test the fallback path explicitly — stop the Remotion service and confirm
      caption rendering still works via the ASS fallback rather than hard-failing
- [ ] Font files used in `fontFamily` props must be installed on the system or
      bundled with the Remotion project (same Montserrat/Bangers/Inter/NotoSansDevanagari
      fonts referenced in the original caption style presets) — verify Remotion's
      font loading picks up `NotoSansDevanagari` correctly for the `nepali_bold` style
