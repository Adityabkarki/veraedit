"""
Functional end-to-end render test: save a 1-clip timeline for a transcribed
project, queue a render, let the worker run FFmpeg, then verify the MP4 lands
in the renders bucket. Run with the api venv.
"""
import json
import time
import urllib.request
import urllib.error

API = "http://127.0.0.1:8000/api/v1"
EMAIL = "uitest1780107@viraedit.com"
PASSWORD = "TestPass123!"
PROJECT_ID = "f537d1a6-2d64-4f0e-ac83-40ce3d21434b"


def req(method, url, token=None, body=None):
    headers = {}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            txt = resp.read().decode("utf-8", "replace")
            return resp.status, (json.loads(txt) if txt.strip().startswith(("{", "[")) else txt)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


# 1. Login
st, d = req("POST", f"{API}/auth/login", body={"email": EMAIL, "password": PASSWORD})
assert st == 200, f"login {st}: {d}"
token = d["access_token"]
print("1. login OK")

# 2. Get the newest asset + its duration
st, assets = req("GET", f"{API}/projects/{PROJECT_ID}/assets", token=token)
assert st == 200 and assets, f"assets {st}: {assets}"
asset = assets[0]
aid = asset["id"]
dur = asset.get("duration_seconds") or 12.0
clip_end = round(min(12.0, max(2.0, dur)), 2)
print(f"2. asset {aid} status={asset['status']} duration={dur} -> clip 0..{clip_end}s")

# 3. Save a 1-video-clip timeline
timeline = {
    "data": {
        "schema_version": 1,
        "tracks": [
            {
                "id": "track-video-1", "type": "video", "name": "Main Video",
                "clips": [
                    {
                        "id": "clip-1", "asset_id": aid,
                        "source_start": 0.0, "source_end": clip_end,
                        "timeline_start": 0.0, "timeline_end": clip_end,
                        "label": "Intro",
                    }
                ],
            },
            {"id": "track-audio-1", "type": "audio", "name": "Main Audio", "clips": []},
        ],
        "global_settings": {"resolution": "1920x1080", "fps": 30.0, "duration": clip_end},
        "metadata": {},
    },
    "label": "Render test v1",
}
st, tl = req("PUT", f"{API}/projects/{PROJECT_ID}/timeline", token=token, body=timeline)
assert st == 200, f"save timeline {st}: {tl}"
print(f"3. timeline saved: version={tl.get('version')} id={tl.get('id')}")

# 4. Queue a render
st, r = req("POST", f"{API}/projects/{PROJECT_ID}/renders", token=token, body={"platform": "youtube"})
assert st in (200, 202), f"create render {st}: {r}"
rid = r["id"]
print(f"4. render queued: {rid} status={r.get('status')}")

# 5. Poll
print("5. polling render (worker runs FFmpeg)...")
last = ""
final = {}
for i in range(40):
    st, rr = req("GET", f"{API}/projects/{PROJECT_ID}/renders/{rid}", token=token)
    s = rr.get("status") if isinstance(rr, dict) else "?"
    p = rr.get("progress_percent") if isinstance(rr, dict) else "?"
    if s != last:
        print(f"   [{i*3:>3}s] status={s} progress={p}")
        last = s
    if s in ("ready", "error"):
        final = rr
        break
    time.sleep(3)

print("6. final:", json.dumps({k: final.get(k) for k in ("status", "storage_key", "duration_seconds", "error_message")}, ensure_ascii=False))

# 7. Verify the file in the renders bucket
if final.get("status") == "ready" and final.get("storage_key"):
    import boto3
    from botocore.config import Config
    c = boto3.client("s3", endpoint_url="http://localhost:9000",
                     aws_access_key_id="minioadmin", aws_secret_access_key="minioadmin123",
                     config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
                     region_name="us-east-1")
    head = c.head_object(Bucket="viraedit-renders", Key=final["storage_key"])
    print(f"7. RENDERED MP4 in bucket: {head['ContentLength']} bytes, type={head.get('ContentType')}")
    # download link
    st, dl = req("GET", f"{API}/projects/{PROJECT_ID}/renders/{rid}/download", token=token)
    print("   download endpoint:", st, json.dumps(dl)[:160] if isinstance(dl, (dict, list)) else dl[:160])
