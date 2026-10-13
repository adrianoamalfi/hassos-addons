ARG BUILD_FROM
ARG TERMIX_DIGEST
FROM ${BUILD_FROM}@${TERMIX_DIGEST}

ARG BUILD_ARCH BUILD_VERSION TERMIX_VERSION
USER root
COPY LICENSE NOTICE /usr/share/licenses/termix-ha/
COPY rootfs/ /
RUN chmod 755 /usr/local/bin/termix-ha.cjs \
    && mkdir -p /usr/local/share/termix \
    && cp -a /app/nginx /usr/local/share/termix/nginx \
    && cp -a /app/html /usr/local/share/termix/html
CMD ["node", "/usr/local/bin/termix-ha.cjs"]

LABEL org.opencontainers.image.title="Home Assistant App: Termix" \
      org.opencontainers.image.description="SSH server management through Home Assistant ingress" \
      org.opencontainers.image.source="https://github.com/adrianoamalfi/hassos-addons" \
      org.opencontainers.image.licenses="Apache-2.0" \
      io.hass.name="Termix" \
      io.hass.type="addon" \
      io.hass.arch="${BUILD_ARCH}" \
      io.hass.version="${BUILD_VERSION}"
