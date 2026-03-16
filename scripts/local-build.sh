#!/usr/bin/env bash
# Build the addon Docker image locally
# Usage: ./scripts/local-build.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADDON_DIR="${REPO_ROOT}/duplicati"
BUILD_YAML="${ADDON_DIR}/build.yaml"

# Auto-detect architecture
MACHINE=$(uname -m)
case "$MACHINE" in
    x86_64)  BUILD_ARCH="amd64" ;;
    aarch64) BUILD_ARCH="aarch64" ;;
    arm64)   BUILD_ARCH="aarch64" ;;
    *)       echo "Unsupported host architecture: $MACHINE"; exit 1 ;;
esac

echo "Building addon: duplicati"
echo "Architecture:   ${BUILD_ARCH}"
echo ""

# Read build args from build.yaml using grep/sed
BUILD_FROM=$(grep "${BUILD_ARCH}:" "$BUILD_YAML" | head -1 | sed 's/.*: *"\(.*\)"/\1/')
TEMPIO_VERSION=$(grep 'TEMPIO_VERSION:' "$BUILD_YAML" | sed 's/.*: *"\(.*\)"/\1/')
DUPLICATI_VERSION=$(grep 'DUPLICATI_VERSION:' "$BUILD_YAML" | sed 's/.*: *"\(.*\)"/\1/')
DUPLICATI_CHANNEL=$(grep 'DUPLICATI_CHANNEL:' "$BUILD_YAML" | sed 's/.*: *"\(.*\)"/\1/')
DUPLICATI_DATE=$(grep 'DUPLICATI_DATE:' "$BUILD_YAML" | sed 's/.*: *"\(.*\)"/\1/')

echo "Base image:     ${BUILD_FROM}"
echo "Tempio:         ${TEMPIO_VERSION}"
echo "Duplicati:      ${DUPLICATI_VERSION} (${DUPLICATI_CHANNEL}, ${DUPLICATI_DATE})"
echo ""

IMAGE_TAG="local/duplicati:latest"

echo "Building image: ${IMAGE_TAG}"
echo "---"

docker build \
    --build-arg "BUILD_FROM=${BUILD_FROM}" \
    --build-arg "BUILD_ARCH=${BUILD_ARCH}" \
    --build-arg "TEMPIO_VERSION=${TEMPIO_VERSION}" \
    --build-arg "DUPLICATI_VERSION=${DUPLICATI_VERSION}" \
    --build-arg "DUPLICATI_CHANNEL=${DUPLICATI_CHANNEL}" \
    --build-arg "DUPLICATI_DATE=${DUPLICATI_DATE}" \
    -t "${IMAGE_TAG}" \
    -f "${ADDON_DIR}/Dockerfile" \
    "${ADDON_DIR}"

echo ""
echo "---"
echo "Build complete: ${IMAGE_TAG}"
echo "Run with: ./scripts/local-test.sh"
