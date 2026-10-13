#!/usr/bin/env bash
# Exit 0: current; 1: update available; 2: check failed.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "${APP_PYTHON:-python3}" "${REPO_ROOT}/scripts/upstream.py" "$@"
