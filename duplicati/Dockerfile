# https://developers.home-assistant.io/docs/add-ons/configuration#add-on-dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# Execute during the build of the image
ARG TEMPIO_VERSION BUILD_ARCH DUPLICATI_VERSION

RUN \
    curl -sSLf -o /usr/bin/tempio \
    "https://github.com/home-assistant/tempio/releases/download/${TEMPIO_VERSION}/tempio_${BUILD_ARCH}"

RUN if dpkg --print-foreign-architectures | grep -q armhf; then \
    dpkg --remove-architecture armhf; \
    fi

RUN apt-get update && apt-get install -y gnupg2 wget

RUN apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF && \
    echo "deb http://download.mono-project.com/repo/debian buster main" | tee /etc/apt/sources.list.d/mono-official.list

RUN apt-get update && \
    apt-get install mono-devel apt-transport-https nano git-core software-properties-common dirmngr -y

# DOWNLOAD FROM DUPLICATI
RUN wget https://updates.duplicati.com/beta/duplicati_${DUPLICATI_VERSION}_all.deb && \
    apt install ./duplicati_${DUPLICATI_VERSION}_all.deb -y

# Copy root filesystem
COPY rootfs /

# Fix Backblaze B2 Cloud Storage
RUN rm -rf /usr/share/ca-certificates/mozilla/DST_Root_CA_X3.crt && \
    update-ca-certificates