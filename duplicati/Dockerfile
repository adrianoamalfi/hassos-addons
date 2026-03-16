# https://developers.home-assistant.io/docs/add-ons/configuration#add-on-dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# Build arguments
ARG TEMPIO_VERSION BUILD_ARCH DUPLICATI_VERSION DUPLICATI_CHANNEL DUPLICATI_DATE

# Install Tempio (Home Assistant template engine)
RUN curl -sSLf -o /usr/bin/tempio \
    "https://github.com/home-assistant/tempio/releases/download/${TEMPIO_VERSION}/tempio_${BUILD_ARCH}" \
    && chmod +x /usr/bin/tempio

# Remove foreign architecture if present
RUN if dpkg --print-foreign-architectures | grep -q armhf; then \
    dpkg --remove-architecture armhf; \
    fi

# Map Home Assistant architecture to Duplicati architecture and install
RUN set -eux; \
    case "${BUILD_ARCH}" in \
        amd64)   DUPLICATI_ARCH="x64" ;; \
        aarch64) DUPLICATI_ARCH="arm64" ;; \
        *)       echo "Unsupported architecture: ${BUILD_ARCH}" && exit 1 ;; \
    esac; \
    DEB_NAME="duplicati-${DUPLICATI_VERSION}_${DUPLICATI_CHANNEL}_${DUPLICATI_DATE}-linux-${DUPLICATI_ARCH}-gui.deb"; \
    DEB_URL="https://updates.duplicati.com/${DUPLICATI_CHANNEL}/${DEB_NAME}"; \
    apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates curl libicu72 nginx jq \
    && curl -sSLf -o "/tmp/${DEB_NAME}" "${DEB_URL}" \
    && apt-get install -y --no-install-recommends "/tmp/${DEB_NAME}" \
    && rm -f "/tmp/${DEB_NAME}" \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /etc/nginx/sites-enabled/default

# Copy root filesystem
COPY rootfs /

# Ensure scripts are executable
RUN chmod +x /usr/bin/start_duplicati \
    && chmod +x /usr/bin/start_nginx \
    && chmod +x /etc/services.d/duplicati/run \
    && chmod +x /etc/services.d/duplicati/finish \
    && chmod +x /etc/services.d/nginx/run \
    && chmod +x /etc/services.d/nginx/finish

# OCI image labels
LABEL \
    org.opencontainers.image.title="Home Assistant Add-on: Duplicati" \
    org.opencontainers.image.description="Store securely encrypted backups on cloud storage services" \
    org.opencontainers.image.source="https://github.com/adrianoamalfi/hassos-addons" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.url="https://github.com/adrianoamalfi/hassos-addons/tree/main/duplicati" \
    org.opencontainers.image.vendor="Adriano Amalfi" \
    io.hass.name="Duplicati" \
    io.hass.description="Store securely encrypted backups on cloud storage services" \
    io.hass.type="addon" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.version="${DUPLICATI_VERSION}"

# Health check: verify nginx is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -sf http://localhost:8080/ || exit 1
