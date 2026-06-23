"""Kill all Python processes running ViraEdit API (uvicorn / spawn_main)."""
from __future__ import annotations

import subprocess
import time


def main() -> None:
    killed: list[int] = []
    ps_cmd = (
        "Get-CimInstance Win32_Process -Filter \"name='python.exe'\" | "
        "Where-Object { $_.CommandLine -match 'spawn_main' -or $_.CommandLine -match 'uvicorn main:app' } | "
        "Select-Object -ExpandProperty ProcessId"
    )
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_cmd],
        capture_output=True,
        text=True,
    )
    for line in (result.stdout or "").splitlines():
        line = line.strip()
        if line.isdigit():
            pid = int(line)
            r = subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True, text=True)
            killed.append(pid)
            print(f"taskkill PID {pid}: {r.stdout.strip() or r.stderr.strip()}")

    time.sleep(2)
    net = subprocess.check_output(["netstat", "-ano"], text=True, errors="replace")
    left = [ln.strip() for ln in net.splitlines() if ":8000" in ln and "LISTENING" in ln]
    print(f"\nKilled {len(killed)} process(es).")
    print(f"Port 8000 listeners ({len(left)}):")
    for ln in left:
        print(f"  {ln}")
    if left:
        print("\nIf listeners remain, close Cursor terminals running uvicorn or reboot.")


if __name__ == "__main__":
    main()
