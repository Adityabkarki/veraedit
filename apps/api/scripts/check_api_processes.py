"""List uvicorn/python processes on port 8000."""
from __future__ import annotations

import subprocess
import sys
from datetime import datetime

def main() -> None:
    out = subprocess.check_output(["netstat", "-ano"], text=True, errors="replace")
    pids = set()
    for line in out.splitlines():
        if ":8000" in line and "LISTENING" in line:
            parts = line.split()
            if parts:
                pids.add(int(parts[-1]))

    print(f"PIDs listening on 8000: {sorted(pids)}")
    for pid in sorted(pids):
        try:
            out = subprocess.check_output(
                [
                    "powershell", "-NoProfile", "-Command",
                    f"$p=Get-Process -Id {pid} -EA SilentlyContinue; "
                    f"$c=Get-CimInstance Win32_Process -Filter 'ProcessId={pid}'; "
                    f"if($p){{$p.StartTime}}; if($c){{$c.CommandLine}}",
                ],
                text=True,
                errors="replace",
            )
            print(f"\nPID {pid}:")
            print(out.strip()[:400])
        except Exception as exc:
            print(f"\nPID {pid}: {exc}")

    import urllib.request
    import json
    spec = json.load(urllib.request.urlopen("http://127.0.0.1:8000/openapi.json", timeout=5))
    style = [k for k in spec.get("paths", {}) if "style" in k]
    print("\nLive style routes:")
    for r in sorted(style):
        print(f"  {r}")
    has_upload = any("upload" in r for r in style)
    print(f"\nHas style-extract-upload: {has_upload}")

if __name__ == "__main__":
    main()
