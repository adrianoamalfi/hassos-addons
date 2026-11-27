ARG BUILD_FROM=ghcr.io/home-assistant/aarch64-base-debian:bookworm
ARG NODE_VERSION=22

# --- Stage 1: build React frontend ---
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

# --- Stage 2: runtime ---
FROM ${BUILD_FROM}

ARG BUILD_ARCH BUILD_VERSION

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 python3-pip python3-venv nginx jq \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /etc/nginx/sites-enabled/default

COPY backend/requirements.txt /opt/awtrix/requirements.txt
RUN python3 -m venv /opt/awtrix \
    && /opt/awtrix/bin/pip install --no-cache-dir -r /opt/awtrix/requirements.txt

COPY backend/ /opt/awtrix/backend/
COPY --from=frontend-build /build/dist /var/www/awtrix
COPY rootfs/ /

RUN chmod 755 /usr/bin/start_nginx /usr/bin/start_backend \
    && chmod 755 /etc/services.d/nginx/run \
    && chmod 755 /etc/services.d/nginx/finish \
    && chmod 755 /etc/services.d/awtrix-backend/run \
    && chmod 755 /etc/services.d/awtrix-backend/finish

LABEL org.opencontainers.image.title="Home Assistant Add-on: AWTRIX Manager" \
      org.opencontainers.image.description="Manage AWTRIX NG LED matrix displays from Home Assistant" \
      org.opencontainers.image.source="https://github.com/adrianoamalfi/hassos-addons" \
      org.opencontainers.image.licenses="Apache-2.0" \
      io.hass.name="AWTRIX Manager" \
      io.hass.type="addon" \
      io.hass.arch="${BUILD_ARCH}" \
      io.hass.version="${BUILD_VERSION}"

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/')" || exit 1
