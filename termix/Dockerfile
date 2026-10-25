ARG BUILD_FROM
ARG TERMIX_DIGEST
FROM ${BUILD_FROM}@${TERMIX_DIGEST} AS adapted

ARG BUILD_ARCH BUILD_VERSION TERMIX_VERSION
USER root
COPY LICENSE NOTICE /usr/share/licenses/termix-ha/
COPY licenses/ /usr/share/licenses/termix-ha/third-party/
COPY rootfs/ /
RUN chmod 755 /usr/local/bin/termix-ha.cjs \
    && cp /usr/share/licenses/termix-ha/third-party/plugin-sdk-LICENSE /app/packages/plugin-sdk/LICENSE \
    && rm -rf /app/opkssh-bundled \
    && mkdir -p /usr/local/share/termix \
    && cp -a /app/nginx /usr/local/share/termix/nginx \
    && cp -a /app/html /usr/local/share/termix/html
RUN node /usr/local/bin/termix-license-check.cjs

# A whiteout alone would leave the excluded binary in inherited OCI layers.
# Copy the sanitized filesystem into a fresh image so those bytes are absent
# from every distributed layer, preserving the upstream runtime configuration.
FROM scratch
ARG BUILD_ARCH BUILD_VERSION TERMIX_VERSION
COPY --from=adapted / /
USER root
WORKDIR /app
ENV PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    NODE_VERSION="24.21.0" \
    YARN_VERSION="1.22.22" \
    DATA_DIR="/app/data" \
    PORT="8080" \
    NODE_ENV="production" \
    OPKSSH_VERSION="v0.16.0" \
    OPKSSH_SHA256_AMD64="c018c3e7baf98612b923e742dd87be38650bf61e3b755fb2bc90de177568b1bf" \
    OPKSSH_SHA256_ARM64="9dd10c2b6ce99cde18e52c054877ca014134b291fd82afe71741c68db4f83d44"
EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "/usr/local/bin/termix-ha.cjs"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e 'fetch("http://127.0.0.1:30001/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'

# Do not redistribute the optional OPKSSH binary until its dependency licensing
# is cleared. Its Termix plugin requires an external, separately obtained binary.
ENV OPKSSH_BUNDLED_DIR=""

LABEL org.opencontainers.image.title="Home Assistant App: Termix" \
      org.opencontainers.image.description="SSH server management through Home Assistant ingress" \
      org.opencontainers.image.source="https://github.com/adrianoamalfi/hassos-addons" \
      org.opencontainers.image.licenses="Apache-2.0" \
      io.hass.name="Termix" \
      io.hass.type="addon" \
      io.hass.arch="${BUILD_ARCH}" \
      io.hass.version="${BUILD_VERSION}"
