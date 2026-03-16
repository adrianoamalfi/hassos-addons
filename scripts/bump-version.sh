#!/usr/bin/env bash
# Bump addon and/or Duplicati version
# Usage: ./scripts/bump-version.sh --version 1.1.0 [--duplicati-version 2.2.0.107] [--duplicati-date 2026-03-20]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Defaults
ADDON_VERSION=""
DUPLICATI_VERSION=""
DUPLICATI_DATE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --version)
            ADDON_VERSION="$2"; shift 2 ;;
        --duplicati-version)
            DUPLICATI_VERSION="$2"; shift 2 ;;
        --duplicati-date)
            DUPLICATI_DATE="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [--version <addon-version>] [--duplicati-version <ver>] [--duplicati-date <date>]"
            echo ""
            echo "Options:"
            echo "  --version            New addon version for config.yaml"
            echo "  --duplicati-version  New Duplicati version for build.yaml"
            echo "  --duplicati-date     New Duplicati release date for build.yaml"
            exit 0 ;;
        *)
            echo "Unknown option: $1"; exit 1 ;;
    esac
done

ADDON_DIR="${REPO_ROOT}/duplicati"
CONFIG_YAML="${ADDON_DIR}/config.yaml"
BUILD_YAML="${ADDON_DIR}/build.yaml"
CHANGELOG="${ADDON_DIR}/CHANGELOG.md"

echo "Updating addon: duplicati"
echo "---"

# Update addon version in config.yaml
if [[ -n "$ADDON_VERSION" ]]; then
    OLD_VERSION=$(grep '^version:' "$CONFIG_YAML" | sed 's/version: *"\(.*\)"/\1/')
    sed -i.bak "s/^version: *\".*\"/version: \"${ADDON_VERSION}\"/" "$CONFIG_YAML"
    rm -f "${CONFIG_YAML}.bak"
    echo "config.yaml: version ${OLD_VERSION} -> ${ADDON_VERSION}"
fi

# Update Duplicati version in build.yaml
if [[ -n "$DUPLICATI_VERSION" ]]; then
    OLD_DUP_VERSION=$(grep 'DUPLICATI_VERSION:' "$BUILD_YAML" | sed 's/.*: *"\(.*\)"/\1/')
    sed -i.bak "s/DUPLICATI_VERSION: *\".*\"/DUPLICATI_VERSION: \"${DUPLICATI_VERSION}\"/" "$BUILD_YAML"
    rm -f "${BUILD_YAML}.bak"
    echo "build.yaml:  DUPLICATI_VERSION ${OLD_DUP_VERSION} -> ${DUPLICATI_VERSION}"
fi

# Update Duplicati date in build.yaml
if [[ -n "$DUPLICATI_DATE" ]]; then
    OLD_DATE=$(grep 'DUPLICATI_DATE:' "$BUILD_YAML" | sed 's/.*: *"\(.*\)"/\1/')
    sed -i.bak "s/DUPLICATI_DATE: *\".*\"/DUPLICATI_DATE: \"${DUPLICATI_DATE}\"/" "$BUILD_YAML"
    rm -f "${BUILD_YAML}.bak"
    echo "build.yaml:  DUPLICATI_DATE ${OLD_DATE} -> ${DUPLICATI_DATE}"
fi

# Prepend changelog entry if addon version was bumped
if [[ -n "$ADDON_VERSION" ]] && [[ -f "$CHANGELOG" ]]; then
    DATE_NOW=$(date +%Y-%m-%d)
    ENTRY="## ${ADDON_VERSION}\n"

    if [[ -n "$DUPLICATI_VERSION" ]]; then
        ENTRY="${ENTRY}\n- ⬆️ Update Duplicati to v${DUPLICATI_VERSION}"
        if [[ -n "$DUPLICATI_DATE" ]]; then
            ENTRY="${ENTRY} (${DUPLICATI_DATE})"
        fi
        ENTRY="${ENTRY}\n"
    fi

    # Insert after the HTML comment line
    sed -i.bak "/^<!-- .* -->/a\\
\\
${ENTRY}" "$CHANGELOG"
    rm -f "${CHANGELOG}.bak"
    echo "CHANGELOG:   Added section for ${ADDON_VERSION}"
fi

echo "---"
echo "Done! Review changes with: git diff duplicati/"
