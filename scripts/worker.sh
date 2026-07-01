#!/usr/bin/env bash
# ViraEdit Celery worker — Linux/macOS
# Usage: scripts/worker.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/api"

if [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

echo "Starting Celery worker (queues: transcription, analysis, render, ai)..."
exec celery -A celery_app worker \
  --queues=transcription,analysis,render,ai,default \
  --pool=solo \
  --loglevel=info
