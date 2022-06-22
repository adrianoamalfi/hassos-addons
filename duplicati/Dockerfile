# https://developers.home-assistant.io/docs/add-ons/configuration#add-on-dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# Execute during the build of the image
ARG TEMPIO_VERSION BUILD_ARCH
RUN \
    curl -sSLf -o /usr/bin/tempio \
    "https://github.com/home-assistant/tempio/releases/download/${TEMPIO_VERSION}/tempio_${BUILD_ARCH}"

RUN apk add --no-cache mono --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing && \
    # apk add --no-cache --virtual=.build-dependencies ca-certificates && \
    #cert-sync /etc/ssl/certs/ca-certificates.crt && \
    #apk del .build-dependencies

RUN set -xe && \
	echo "**** install duplicati ****" && \
	mkdir -p /app/duplicati && \
	if [ -z ${VERSION} ]; then \
		VERSION=$(curl -sL "https://api.github.com/repos/duplicati/duplicati/releases" | \
			jq -r 'first(.[] | select(.tag_name | contains("beta"))) | .tag_name'); \
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
