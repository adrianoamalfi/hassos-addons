# https://developers.home-assistant.io/docs/add-ons/configuration#add-on-dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# Execute during the build of the image
ARG TEMPIO_VERSION BUILD_ARCH

ENV MONO_VERSION 6.12.0.182

RUN \
    curl -sSLf -o /usr/bin/tempio \
    "https://github.com/home-assistant/tempio/releases/download/${TEMPIO_VERSION}/tempio_${BUILD_ARCH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends gnupg dirmngr unzip ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && export GNUPGHOME="$(mktemp -d)" \
  && gpg --batch --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF \
  && gpg --batch --export --armor 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF > /etc/apt/trusted.gpg.d/mono.gpg.asc \
  && gpgconf --kill all \
  && rm -rf "$GNUPGHOME" \
  && apt-key list | grep Xamarin \
  && apt-get purge -y --auto-remove gnupg dirmngr

RUN echo "deb https://download.mono-project.com/repo/debian stable-buster/snapshots/$MONO_VERSION main" > /etc/apt/sources.list.d/mono-official-stable.list \
  && apt-get update \
  && apt-get install -y mono-runtime \
  && rm -rf /var/lib/apt/lists/* /tmp/*

RUN apt-get update \
  && apt-get install -y binutils curl mono-devel ca-certificates-mono fsharp mono-vbnc nuget referenceassemblies-pcl \
  && rm -rf /var/lib/apt/lists/* /tmp/*

RUN set -xe && \
	echo "**** install duplicati ****" && \
	mkdir -p /app/duplicati && \
	if [ -z ${VERSION} ]; then \
		VERSION=$(curl -sL "https://api.github.com/repos/duplicati/duplicati/releases" | \
			jq -r 'first(.[] | select(.tag_name | contains("canary"))) | .tag_name'); \
	fi && \
	curl -o \
		/tmp/duplicati.zip -L \
		"$(curl -s https://api.github.com/repos/duplicati/duplicati/releases/tags/${VERSION} | \
			jq -r '.assets[].browser_download_url' | grep '.zip$' | grep -v signatures)" && \
	unzip \
		/tmp/duplicati.zip -d \
		/app/duplicati && \
	echo "**** cleanup ****" && \
	rm -rf \
		/tmp/*


# Copy root filesystem
COPY rootfs /
