"""
Upload the user's real ~1.1GB video through the full flow and report timing /
errors. Streams the file to the presigned MinIO URL (no full in-memory load).
"""
import json
import time
import os
import urllib.request
import urllib.error

API = "http://127.0.0.1:8000/api/v1"
EMAIL = "uitest1780107@viraedit.com"
PASSWORD = "TestPass123!"
VIDEO = r"C:\Users\dell\Downloads\Cam B - Low Quality.mp4"


def jreq(method, url, token=None, body=None):
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
            t = resp.read().decode()
            return resp.status, (json.loads(t) if t.strip().startswith(("{", "[")) else t)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


size = os.path.getsize(VIDEO)
print(f"file: {VIDEO}")
print(f"size: {size:,} bytes ({size/1e9:.2f} GB)")

st, d = jreq("POST", f"{API}/auth/login", body={"email": EMAIL, "password": PASSWORD})
assert st == 200, f"login {st}: {d}"
token = d["access_token"]
print("login OK")

st, proj = jreq("POST", f"{API}/projects", token=token,
                body={"name": "Cam B - Low Quality", "content_type": "other", "editor_mode": "full_editor"})
assert st == 201, f"project {st}: {proj}"
pid = proj["id"]
print(f"project: {pid}")

st, asset = jreq("POST", f"{API}/projects/{pid}/assets", token=token,
                 body={"filename": os.path.basename(VIDEO), "mime_type": "video/mp4", "file_size": size})
assert st == 201, f"asset {st}: {asset}"
aid = asset["asset_id"]
print(f"asset: {aid}")
print(f"upload_url host: {asset['upload_url'].split('/')[2]}")

# Streaming PUT of the real file
print("PUT to MinIO (streaming the real file)...")
t0 = time.time()
with open(VIDEO, "rb") as f:
    put = urllib.request.Request(
        asset["upload_url"], data=f, method="PUT",
        headers={"Content-Type": "video/mp4", "Content-Length": str(size)},
    )
    try:
        with urllib.request.urlopen(put, timeout=900) as resp:
            print(f"  PUT status: {resp.status} in {time.time()-t0:.1f}s")
    except urllib.error.HTTPError as e:
        print(f"  PUT FAILED {e.code}: {e.read().decode()[:400]}")
        raise

st, conf = jreq("POST", f"{API}/projects/{pid}/assets/{aid}/confirm", token=token, body={"file_size": size})
print(f"confirm: {st} status={conf.get('status') if isinstance(conf, dict) else conf}")
print(f"\nproject_id={pid} asset_id={aid}")
