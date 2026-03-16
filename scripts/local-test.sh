#!/usr/bin/env bash
# Run the addon Docker image locally for testing
# Usage: ./scripts/local-test.sh

set -euo pipefail

IMAGE_TAG="local/duplicati:latest"
CONTAINER_NAME="duplicati-test"

# Check if image exists
if ! docker image inspect "${IMAGE_TAG}" &>/dev/null; then
    echo "Error: Image '${IMAGE_TAG}' not found."
    echo "Build it first with: ./scripts/local-build.sh"
    exit 1
fi

# Stop and remove existing container if running
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Stopping existing container: ${CONTAINER_NAME}"
    docker rm -f "${CONTAINER_NAME}" &>/dev/null || true
fi

# Create temporary test volumes
TEST_DIR="/tmp/duplicati-test"
mkdir -p "${TEST_DIR}/data/duplicati"
mkdir -p "${TEST_DIR}/config"
mkdir -p "${TEST_DIR}/ssl"
mkdir -p "${TEST_DIR}/media"
mkdir -p "${TEST_DIR}/addons"
mkdir -p "${TEST_DIR}/share"
mkdir -p "${TEST_DIR}/backup"

echo "Starting duplicati container..."
echo "  Image:     ${IMAGE_TAG}"
echo "  Container: ${CONTAINER_NAME}"
echo "  Data dir:  ${TEST_DIR}"
echo ""

docker run -d \
    --name "${CONTAINER_NAME}" \
    -p 8080:8080 \
    -v "${TEST_DIR}/data:/data" \
    -v "${TEST_DIR}/config:/config" \
    -v "${TEST_DIR}/ssl:/ssl" \
    -v "${TEST_DIR}/media:/media" \
    -v "${TEST_DIR}/addons:/addons" \
    -v "${TEST_DIR}/share:/share" \
    -v "${TEST_DIR}/backup:/backup" \
    "${IMAGE_TAG}"

echo ""
echo "---"
echo "Duplicati is running at: http://localhost:8080"
echo ""
echo "Useful commands:"
echo "  Logs:    docker logs -f ${CONTAINER_NAME}"
echo "  Shell:   docker exec -it ${CONTAINER_NAME} /bin/bash"
echo "  Stop:    docker rm -f ${CONTAINER_NAME}"
echo "  Cleanup: rm -rf ${TEST_DIR}"
