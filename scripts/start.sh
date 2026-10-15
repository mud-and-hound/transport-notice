#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT/backend"
exec "$PROJECT_ROOT/venv/bin/python" -m uvicorn main:app --host "${HOST:-0.0.0.0}" --port "${PORT:-8606}"
