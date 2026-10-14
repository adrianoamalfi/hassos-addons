#!/usr/bin/env bash
# Interactive local container. CI uses apps.py test for automated checks.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "${APP_PYTHON:-python3}" "${REPO_ROOT}/scripts/apps.py" run "$@"
