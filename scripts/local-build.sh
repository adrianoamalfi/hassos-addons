#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "${APP_PYTHON:-python3}" "${REPO_ROOT}/scripts/apps.py" build "$@"
