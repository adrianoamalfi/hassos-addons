# https://developers.home-assistant.io/docs/add-ons/configuration#add-on-dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# Execute during the build of the image
ARG TEMPIO_VERSION BUILD_ARCH DUPLICATI_VERSION

# Install Tempio (Home Assistant template engine)
RUN curl -sSLf -o /usr/bin/tempio \
    "https://github.com/home-assistant/tempio/releases/download/${TEMPIO_VERSION}/tempio_${BUILD_ARCH}" \
    && chmod +x /usr/bin/tempio

# Remove foreign architecture if present
RUN if dpkg --print-foreign-architectures | grep -q armhf; then \
    dpkg --remove-architecture armhf; \
    fi

# Install Mono runtime and Duplicati
RUN apt-get update \
    && apt-get install -y --no-install-recommends gnupg2 wget dirmngr ca-certificates \
    && gpg --batch --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF \
    && gpg --batch --export 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF > /usr/share/keyrings/mono-official-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/mono-official-archive-keyring.gpg] http://download.mono-project.com/repo/debian stable-buster main" \
       > /etc/apt/sources.list.d/mono-official.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       mono-runtime \
       apt-transport-https \
       software-properties-common \
    && wget -q "https://updates.duplicati.com/beta/duplicati_${DUPLICATI_VERSION}_all.deb" \
    && apt-get install -y --no-install-recommends "./duplicati_${DUPLICATI_VERSION}_all.deb" \
    && rm -f "duplicati_${DUPLICATI_VERSION}_all.deb" \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy root filesystem
COPY rootfs /

# Ensure scripts are executable
RUN chmod +x /usr/bin/start_duplicati \
    && chmod +x /etc/services.d/duplicati/run \
    && chmod +x /etc/services.d/duplicati/finish

# Fix Backblaze B2 Cloud Storage (remove expired DST Root CA X3 certificate)
RUN rm -f /usr/share/ca-certificates/mozilla/DST_Root_CA_X3.crt \
    && update-ca-certificates
