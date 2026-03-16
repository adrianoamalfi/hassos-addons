#!/usr/bin/env bash
# Check for new Duplicati canary releases on GitHub
# Usage: ./scripts/check-updates.sh
# Exit code: 0 = up to date, 1 = update available
# Requires: curl, jq

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_YAML="${REPO_ROOT}/duplicati/build.yaml"

# Read current version from build.yaml
CURRENT_VERSION=$(grep 'DUPLICATI_VERSION:' "$BUILD_YAML" | sed 's/.*: *"\(.*\)"/\1/')
CURRENT_DATE=$(grep 'DUPLICATI_DATE:' "$BUILD_YAML" | sed 's/.*: *"\(.*\)"/\1/')
CURRENT_CHANNEL=$(grep 'DUPLICATI_CHANNEL:' "$BUILD_YAML" | sed 's/.*: *"\(.*\)"/\1/')

echo "Current Duplicati version: ${CURRENT_VERSION} (${CURRENT_CHANNEL}, ${CURRENT_DATE})"
echo ""

# Check dependencies
for cmd in curl jq; do
    if ! command -v "$cmd" &> /dev/null; then
        echo "Error: '$cmd' is required but not installed."
        exit 2
    fi
done

# Query GitHub API for latest canary release
echo "Checking GitHub for latest ${CURRENT_CHANNEL} release..."
RELEASES=$(curl -sSL "https://api.github.com/repos/duplicati/duplicati/releases?per_page=20")

# Find latest release matching the current channel
LATEST=$(echo "$RELEASES" | jq -r \
    --arg channel "$CURRENT_CHANNEL" \
    '[.[] | select(.tag_name | contains($channel))][0]')

if [[ "$LATEST" == "null" ]] || [[ -z "$LATEST" ]]; then
    echo "No ${CURRENT_CHANNEL} releases found."
    exit 0
fi

LATEST_TAG=$(echo "$LATEST" | jq -r '.tag_name')
# Tag format: v2.2.0.106_canary_2026-03-06
LATEST_VERSION=$(echo "$LATEST_TAG" | sed "s/^v\(.*\)_${CURRENT_CHANNEL}_.*$/\1/")
LATEST_DATE=$(echo "$LATEST_TAG" | sed "s/^v.*_${CURRENT_CHANNEL}_\(.*\)$/\1/")

echo "Latest available: ${LATEST_VERSION} (${CURRENT_CHANNEL}, ${LATEST_DATE})"
echo ""

if [[ "$CURRENT_VERSION" == "$LATEST_VERSION" ]] && [[ "$CURRENT_DATE" == "$LATEST_DATE" ]]; then
    echo "Already up to date."
    exit 0
else
    echo "Update available!"
    echo ""
    echo "Run the following to update:"
    echo "  ./scripts/bump-version.sh \\"
    echo "    --duplicati-version ${LATEST_VERSION} \\"
    echo "    --duplicati-date ${LATEST_DATE}"
    exit 1
fi
