# Module 06 — In-Editor AI Image Generation

## Stack
- FastAPI router (synchronous — fast enough)
- OpenAI DALL-E 3 via `openai` SDK (`settings.openai_api_key`)
- Fallback: Ollama local image gen if budget exceeded
- FFmpeg for image → video segment conversion
- MinIO for storing generated images
- Budget tracker for every generation

---

## Files to Create / Modify

### `backend/app/processors/imagegen.py`
```python
import os, io, base64, uuid, subprocess, urllib.request
from openai import AsyncOpenAI
from PIL import Image
from ..config import settings
from ..services.ai_budget import budget

client = AsyncOpenAI(api_key=settings.openai_api_key)

# DALL-E 3 supported sizes
DALL_E_SIZES = {
    "1:1":  "1024x1024",
    "16:9": "1792x1024",
    "9:16": "1024x1792",
}

async def generate_image(
    prompt: str,
    aspect_ratio: str = "9:16",
    style: str = "vivid",          # "vivid" | "natural"
    quality: str = "standard",     # "standard" | "hd"
    enhance_prompt: bool = True,
    brand_context: dict = None,
) -> dict:
    """
    Generate image using DALL-E 3.
    Returns: {url, revised_prompt, cost_usd}
    """
    full_prompt = prompt
    if enhance_prompt and brand_context:
        full_prompt = await _enhance_prompt(prompt, brand_context)

    size = DALL_E_SIZES.get(aspect_ratio, "1024x1792")

    # Cost: standard=$0.04, hd=$0.08 per image
    cost = 0.04 if quality == "standard" else 0.08
    budget.record(cost)

    if budget.should_use_local():
        return await _generate_ollama(full_prompt, aspect_ratio)

    resp = await client.images.generate(
        model="dall-e-3",
        prompt=full_prompt,
        size=size,
        quality=quality,
        style=style,
        n=1,
        response_format="url",
    )
    return {
        "url": resp.data[0].url,
        "revised_prompt": resp.data[0].revised_prompt,
        "cost_usd": cost,
    }


async def _enhance_prompt(prompt: str, context: dict) -> str:
    """Use GPT-4o-mini to improve prompt with brand context."""
    budget.record(0.00005)
    resp = await client.chat.completions.create(
        model=settings.openai_model_fast,
        messages=[{"role": "user", "content":
            f"Improve this image prompt for a {context.get('platform','social media')} video "
            f"with {context.get('visual_style','professional')} style. "
            f"Brand colors: {context.get('colors',[])}. "
            f"Original: '{prompt}'. "
            f"Return ONLY the improved prompt, max 200 words."}],
        max_tokens=200,
    )
    return resp.choices[0].message.content.strip()


async def _generate_ollama(prompt: str, aspect_ratio: str) -> dict:
    """Fallback: local Ollama image generation (if model supports it)."""
    import httpx
    async with httpx.AsyncClient(base_url=settings.ollama_base_url, timeout=120) as c:
        resp = await c.post("/api/generate", json={
            "model": "llava",
            "prompt": f"Generate an image: {prompt}",
            "stream": False,
        })
    # Ollama doesn't truly generate images without special models
    # Return a placeholder — or raise to let frontend show "local not supported"
    return {"url": None, "revised_prompt": prompt, "cost_usd": 0, "error": "local_not_supported"}


def image_url_to_video(
    image_url: str,
    output_path: str,
    duration: float = 3.0,
    fps: int = 30,
    width: int = 1080,
    height: int = 1920,
    animation: str = "ken_burns",  # "static" | "zoom_in" | "ken_burns"
) -> str:
    """Download image from URL and convert to video segment with optional animation."""
    # Download image
    tmp_img = output_path + ".tmp_img.jpg"
    urllib.request.urlretrieve(image_url, tmp_img)

    if animation == "static":
        filter_str = (f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                      f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2")
    elif animation == "zoom_in":
        filter_str = (f"scale=8000:-1,"
                      f"zoompan=z='min(zoom+0.0005,1.1)':d={int(fps*duration)}:"
                      f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={width}x{height}")
    else:  # ken_burns
        filter_str = (f"scale=8000:-1,"
                      f"zoompan=z='if(lte(zoom,1.0),1.05,max(1.001,zoom-0.001))':"
                      f"d={int(fps*duration)}:"
                      f"x='iw/2-(iw/zoom/2)':y='ih/4-(ih/zoom/4)':s={width}x{height}")

    subprocess.run([
        settings.ffmpeg_path, "-loop", "1", "-i", tmp_img,
        "-vf", filter_str,
        "-c:v", "libx264", "-t", str(duration),
        "-pix_fmt", "yuv420p", "-r", str(fps),
        output_path, "-y"
    ], check=True, capture_output=True)

    if os.path.exists(tmp_img):
        os.remove(tmp_img)
    return output_path
```

### `backend/app/routers/imagegen.py`
```python
import uuid, os
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..processors.imagegen import generate_image, image_url_to_video
from ..services.storage import storage_sync
from ..config import settings
import urllib.request

router = APIRouter(prefix="/api/imagegen", tags=["imagegen"])

class GenerateRequest(BaseModel):
    prompt: str
    aspect_ratio: str = "9:16"      # "1:1" | "16:9" | "9:16"
    style: str = "vivid"            # "vivid" | "natural"
    quality: str = "standard"       # "standard" | "hd"
    project_id: str
    enhance_prompt: bool = True
    brand_context: dict = {}

class ImageToVideoRequest(BaseModel):
    image_url: str                  # publicly accessible URL (from DALL-E or MinIO signed URL)
    duration: float = 3.0
    animation: str = "ken_burns"    # "static" | "zoom_in" | "ken_burns"
    project_id: str
    target_width: int = 1080
    target_height: int = 1920

@router.post("/generate")
async def generate(req: GenerateRequest):
    """Synchronous — DALL-E 3 returns in ~10s. No Celery needed."""
    result = await generate_image(
        req.prompt, req.aspect_ratio, req.style, req.quality,
        req.enhance_prompt, req.brand_context,
    )
    if result.get("error"):
        return {"error": result["error"], "message": "Local image generation not supported"}

    # Download image from DALL-E URL and store in MinIO (URLs expire in 1hr)
    img_id = str(uuid.uuid4())
    tmp_path = os.path.join(settings.temp_dir, f"{img_id}.png")
    os.makedirs(settings.temp_dir, exist_ok=True)
    urllib.request.urlretrieve(result["url"], tmp_path)

    img_key = f"projects/{req.project_id}/generated/{img_id}.png"
    storage_sync.put_file(img_key, tmp_path, "image/png")
    signed_url = storage_sync.get_presigned_url(img_key, expires=86400)
    os.remove(tmp_path)

    return {
        "image_key": img_key,
        "url": signed_url,
        "revised_prompt": result.get("revised_prompt", req.prompt),
        "cost_usd": result.get("cost_usd", 0),
    }

@router.post("/to-video")
async def to_video(req: ImageToVideoRequest):
    """Convert generated image to animated video segment."""
    vid_id = str(uuid.uuid4())
    out_path = os.path.join(settings.render_output_dir, f"{vid_id}.mp4")
    os.makedirs(settings.render_output_dir, exist_ok=True)
    image_url_to_video(req.image_url, out_path, req.duration,
                       30, req.target_width, req.target_height, req.animation)
    vid_key = f"generated/{vid_id}.mp4"
    storage_sync.put_file(vid_key, out_path, "video/mp4")
    signed_url = storage_sync.get_presigned_url(vid_key)
    os.remove(out_path)
    return {"video_key": vid_key, "url": signed_url}

@router.get("/styles")
def list_styles():
    return {
        "aspect_ratios": list({"1:1": "1024x1024", "16:9": "1792x1024", "9:16": "1024x1792"}.keys()),
        "styles": ["vivid", "natural"],
        "qualities": ["standard", "hd"],
        "animations": ["static", "zoom_in", "ken_burns"],
    }
```

### Frontend: `frontend/components/editor/ImageGenPanel.tsx`
```tsx
'use client';
import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL;

const ASPECT_RATIOS = [
  { id: "9:16", label: "9:16 Portrait" },
  { id: "1:1", label: "1:1 Square" },
  { id: "16:9", label: "16:9 Landscape" },
];
const STYLES = ["vivid", "natural"];
const ANIMATIONS = ["ken_burns", "zoom_in", "static"];

interface Props {
  projectId: string;
  brandContext?: object;
  onInsert: (key: string, url: string) => void;
}

export function ImageGenPanel({ projectId, brandContext, onInsert }: Props) {
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState('9:16');
  const [style, setStyle] = useState('vivid');
  const [quality, setQuality] = useState('standard');
  const [animation, setAnimation] = useState('ken_burns');
  const [result, setResult] = useState<{url: string; key: string; revised?: string} | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch(`${API}/api/imagegen/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          prompt, aspect_ratio: aspect, style, quality,
          project_id: projectId, enhance_prompt: true, brand_context: brandContext || {},
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.message || data.error); return; }
      setResult({ url: data.url, key: data.image_key, revised: data.revised_prompt });
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const convertToVideo = async () => {
    if (!result) return;
    setLoading(true);
    const res = await fetch(`${API}/api/imagegen/to-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({
        image_url: result.url, animation, project_id: projectId,
      }),
    });
    const data = await res.json();
    onInsert(data.video_key, data.url);
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <h3 className="text-sm font-semibold">AI Image Generator</h3>

      <textarea className="border rounded px-3 py-2 text-sm resize-none" rows={3}
        placeholder="Describe the image... e.g. 'Professional team in modern Kathmandu office'"
        value={prompt} onChange={e => setPrompt(e.target.value)} />

      <div className="flex gap-1 flex-wrap">
        {ASPECT_RATIOS.map(r => (
          <button key={r.id} onClick={() => setAspect(r.id)}
            className={`text-xs px-2 py-1 rounded border ${aspect === r.id ? 'bg-gray-900 text-white' : 'border-gray-300'}`}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <select value={style} onChange={e => setStyle(e.target.value)}
          className="flex-1 border rounded px-2 py-1.5 text-xs">
          {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={quality} onChange={e => setQuality(e.target.value)}
          className="flex-1 border rounded px-2 py-1.5 text-xs">
          <option value="standard">Standard ($0.04)</option>
          <option value="hd">HD ($0.08)</option>
        </select>
      </div>

      <button onClick={generate} disabled={loading || !prompt.trim()}
        className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded py-2 text-sm font-medium disabled:opacity-50">
        {loading ? 'Generating...' : 'Generate with DALL-E 3'}
      </button>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {result && (
        <div className="space-y-2">
          <img src={result.url} alt="" className="w-full rounded border" />
          {result.revised && (
            <p className="text-xs text-gray-400 italic line-clamp-2">
              Revised: {result.revised}
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={() => onInsert(result.key, result.url)}
              className="flex-1 text-xs border rounded py-1.5 hover:bg-gray-50">
              Add as Image
            </button>
            <div className="flex items-center gap-1">
              <select value={animation} onChange={e => setAnimation(e.target.value)}
                className="text-xs border rounded px-1 py-1.5">
                {ANIMATIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <button onClick={convertToVideo} disabled={loading}
                className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded whitespace-nowrap">
                → Video
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Checklist for Cursor

- [ ] `backend/app/processors/imagegen.py` — DALL-E 3 + image-to-video
- [ ] `backend/app/routers/imagegen.py` — generate + to-video endpoints
- [ ] Budget tracker records $0.04/$0.08 per DALL-E call
- [ ] Generated images persisted to MinIO (DALL-E URLs expire in 1hr)
- [ ] `ImageGenPanel.tsx` component
- [ ] `Pillow` in requirements.txt
- [ ] All FFmpeg calls use `settings.ffmpeg_path`
- [ ] `GET /api/imagegen/styles` — returns available options for frontend dropdowns