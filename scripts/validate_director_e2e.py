"""
Phase 5 end-to-end Director pipeline validation.

Usage:
  python scripts/validate_director_e2e.py --synthetic          # all 4 pillars, no API
  python scripts/validate_director_e2e.py --project-id UUID    # real project via API
  python scripts/validate_director_e2e.py --project-id UUID --compile --render

Requires API at http://127.0.0.1:8000 for --project-id mode.
Set VIRAEDIT_EMAIL and VIRAEDIT_PASSWORD or pass --email/--password.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))
sys.path.insert(0, str(REPO_ROOT))

API = os.environ.get("VIRAEDIT_API", "http://127.0.0.1:8000/api/v1")


def req(method: str, url: str, token: str | None = None, body: dict | None = None) -> tuple[int, object]:
    headers: dict[str, str] = {}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=120) as resp:
            text = resp.read().decode("utf-8", "replace")
            return resp.status, json.loads(text) if text.strip().startswith(("{", "[")) else text
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")


def login(email: str, password: str) -> str:
    status, data = req("POST", f"{API}/auth/login", body={"email": email, "password": password})
    if status != 200 or not isinstance(data, dict):
        raise SystemExit(f"Login failed ({status}): {data}")
    return data["access_token"]


def run_synthetic() -> int:
    from tests.fixtures.director_phase5_signals import PHASE5_FIXTURES
    from tests.unit.test_director_phase5_synthetic import _compile_via_tsx

    failures = 0
    for pillar, signals in PHASE5_FIXTURES.items():
        print(f"\n=== Synthetic {pillar} ===")
        try:
            from services.director.resolve_broll import resolve_broll_entries
            from services.director.validate_timeline import validate_director_timeline

            timeline = _compile_via_tsx(pillar, signals)
            timeline = resolve_broll_entries(timeline, content_type=pillar)
            report = validate_director_timeline(timeline)
            print(json.dumps(report.to_dict(), indent=2))
            if not report.passed:
                failures += 1
                print(f"FAIL {pillar}")
            else:
                print(f"PASS {pillar}")
        except Exception as exc:
            failures += 1
            print(f"FAIL {pillar}: {exc}")
    return failures


def run_project(
    project_id: str,
    token: str,
    *,
    compile_first: bool,
    content_type: str | None,
    render: bool,
) -> int:
    if compile_first:
        body: dict = {"project_id": project_id, "overwrite": True}
        if content_type:
            body["content_type"] = content_type
        st, data = req("POST", f"{API}/director/compile", token=token, body=body)
        if st not in (200, 201):
            print(f"Compile failed ({st}): {data}")
            return 1
        print("Compile OK:", data.get("contentType"), "v", data.get("version"))

    st, report = req("GET", f"{API}/projects/{project_id}/director-timeline/validation", token=token)
    if st != 200:
        print(f"Validation request failed ({st}): {report}")
        return 1

    print(json.dumps(report, indent=2))
    if not isinstance(report, dict) or not report.get("passed"):
        return 1

    if render:
        st, render_job = req("POST", f"{API}/projects/{project_id}/renders", token=token, body={"platform": "youtube"})
        if st not in (200, 202):
            print(f"Render queue failed ({st}): {render_job}")
            return 1
        rid = render_job.get("id") if isinstance(render_job, dict) else None
        print(f"Render queued: {rid}")
        for _ in range(60):
            time.sleep(5)
            st, job = req("GET", f"{API}/projects/{project_id}/renders/{rid}", token=token)
            if isinstance(job, dict) and job.get("status") in ("completed", "failed", "error"):
                print("Render status:", job.get("status"))
                if job.get("status") != "completed":
                    return 1
                break
        else:
            print("Render timed out")
            return 1
        print("Manual checks still required — review export for ducking, grade, Devanagari, multicam.")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Director Engine Phase 5 validation")
    parser.add_argument("--synthetic", action="store_true", help="Validate all 4 pillars without API")
    parser.add_argument("--project-id", help="Real project UUID")
    parser.add_argument("--compile", action="store_true", help="Run Auto Edit compile before validate")
    parser.add_argument("--content-type", choices=["podcast", "consultancy", "social", "showcase"])
    parser.add_argument("--render", action="store_true", help="Queue director export after validate")
    parser.add_argument("--email", default=os.environ.get("VIRAEDIT_EMAIL", ""))
    parser.add_argument("--password", default=os.environ.get("VIRAEDIT_PASSWORD", ""))
    args = parser.parse_args()

    if args.synthetic:
        return run_synthetic()

    if not args.project_id:
        parser.error("Provide --project-id or --synthetic")

    if not args.email or not args.password:
        parser.error("Set --email/--password or VIRAEDIT_EMAIL/VIRAEDIT_PASSWORD")

    token = login(args.email, args.password)
    return run_project(
        args.project_id,
        token,
        compile_first=args.compile,
        content_type=args.content_type,
        render=args.render,
    )


if __name__ == "__main__":
    raise SystemExit(main())
