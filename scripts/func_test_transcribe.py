"""
Functional end-to-end test: upload a real MP4 → confirm → worker transcribes
via Groq Whisper → fetch the transcript. Run with the api venv.
"""
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

API = "http://127.0.0.1:8000/api/v1"
EMAIL = "uitest1780107@viraedit.com"
PASSWORD = "TestPass123!"
VIDEO = Path(r"C:\Users\dell\apps\viraedit\sample_nepali.mp4")


def req(method, url, token=None, body=None, raw=None, content_type="application/json"):
    headers = {}
    data = None
    if raw is not None:
        data = raw
        headers["Content-Type"] = content_type
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            txt = resp.read().decode("utf-8", "replace")
            return resp.status, (json.loads(txt) if txt and txt.strip().startswith(("{", "[")) else txt)
    except urllib.error.HTTPError as e:
        txt = e.read().decode("utf-8", "replace")
        return e.code, txt


# 1. Login
st, data = req("POST", f"{API}/auth/login", body={"email": EMAIL, "password": PASSWORD})
assert st == 200, f"login failed {st}: {data}"
token = data["access_token"]
print("1. login: OK")

# 2. Create project
st, proj = req("POST", f"{API}/projects", token=token,
               body={"name": "Func Transcribe Test", "content_type": "other", "editor_mode": "full_editor"})
assert st == 201, f"create project {st}: {proj}"
pid = proj["id"]
print(f"2. project: {pid}")

# 3. Create asset
size = VIDEO.stat().st_size
st, asset = req("POST", f"{API}/projects/{pid}/assets", token=token,
                body={"filename": VIDEO.name, "mime_type": "video/mp4", "file_size": size})
assert st == 201, f"create asset {st}: {asset}"
aid = asset["asset_id"]
print(f"3. asset: {aid} ({size} bytes)")

# 4. PUT to MinIO
st, _ = req("PUT", asset["upload_url"], raw=VIDEO.read_bytes(), content_type="video/mp4")
assert st in (200, 204), f"PUT failed {st}"
print(f"4. PUT to MinIO: {st}")

# 5. Confirm → queues transcription
st, conf = req("POST", f"{API}/projects/{pid}/assets/{aid}/confirm", token=token, body={"file_size": size})
assert st == 200, f"confirm {st}: {conf}"
print(f"5. confirm: status={conf.get('status')}")

# 6. Poll asset status
print("6. polling asset status (worker transcribes via Groq)...")
last = ""
for i in range(40):  # up to ~120s
    st, a = req("GET", f"{API}/projects/{pid}/assets/{aid}", token=token)
    s = a.get("status") if isinstance(a, dict) else "?"
    if s != last:
        print(f"   [{i*3:>3}s] status = {s}")
        last = s
    if s in ("ready", "error", "analyzing"):
        break
    time.sleep(3)

# 7. Fetch transcript
st, t = req("GET", f"{API}/projects/{pid}/assets/{aid}/transcript", token=token)
print("7. transcript endpoint status:", t.get("status") if isinstance(t, dict) else t)
if isinstance(t, dict) and t.get("status") == "ready":
    full = t.get("full_text", "")
    words = t.get("words", [])
    print("   language:", t.get("language"))
    print("   word_count:", len(words))
    print("   full_text:", full[:400])
else:
    print("   (transcript not ready)", json.dumps(t, ensure_ascii=False)[:300])

print("\nDONE. project_id =", pid, "asset_id =", aid)
