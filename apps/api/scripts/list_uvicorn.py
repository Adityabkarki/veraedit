import subprocess
import json
import urllib.request

r = subprocess.run(
    ["powershell", "-NoProfile", "-Command",
     "Get-CimInstance Win32_Process -Filter \"name='python.exe'\" | "
     "Where-Object { $_.CommandLine -match 'main:app' -or $_.CommandLine -match '8000' } | "
     "Select-Object ProcessId, @{N='Cmd';E={$_.CommandLine.Substring(0,[Math]::Min(150,$_.CommandLine.Length))}} | "
     "ConvertTo-Json -Compress"],
    capture_output=True, text=True,
)
print("uvicorn processes:", r.stdout or r.stderr)
spec = json.load(urllib.request.urlopen("http://127.0.0.1:8000/openapi.json", timeout=5))
paths = sorted(k for k in spec["paths"] if "style" in k)
print("live routes:", paths)
print("has upload:", any("upload" in p for p in paths))
