# Adriano's Home Assistant Add-on Repository

[![Builder](https://github.com/adrianoamalfi/hassos-addons/actions/workflows/builder.yaml/badge.svg?branch=main)](https://github.com/adrianoamalfi/hassos-addons/actions/workflows/builder.yaml)
[![Lint](https://github.com/adrianoamalfi/hassos-addons/actions/workflows/lint.yaml/badge.svg)](https://github.com/adrianoamalfi/hassos-addons/actions/workflows/lint.yaml)
[![GitHub issues](https://img.shields.io/github/issues/adrianoamalfi/hassos-addons)](https://github.com/adrianoamalfi/hassos-addons/issues)
[![GitHub last commit](https://img.shields.io/github/last-commit/adrianoamalfi/hassos-addons/main)](https://github.com/adrianoamalfi/hassos-addons/commits/main)
[![License](https://img.shields.io/github/license/adrianoamalfi/hassos-addons)](LICENSE)

## Installation

Click the button below to add this repository to your Home Assistant instance:

[![Add repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fadrianoamalfi%2Fhassos-addons)

Or manually add the repository URL in **Settings > Add-ons > Add-on Store > ⋮ > Repositories**:

```
https://github.com/adrianoamalfi/hassos-addons
```

## Add-ons

### [Duplicati](./duplicati)

![Supports amd64 Architecture][amd64-shield]
![Supports aarch64 Architecture][aarch64-shield]

Store securely encrypted, incremental, compressed backups on cloud storage services. Supports Amazon S3, Backblaze B2, Google Drive, Dropbox, OneDrive, Azure, FTP, SFTP, WebDAV, and many more.

**Key features:**
- AES-256 encryption for all backup data
- Incremental backups to save bandwidth and storage
- Built-in scheduler for automatic backups
- Web UI fully integrated in Home Assistant via ingress
- Backs up HA config, media, share, ssl, addons, and backup folders

## Support

- [Open an issue](https://github.com/adrianoamalfi/hassos-addons/issues/new/choose) for bugs or feature requests
- [Discussions](https://github.com/adrianoamalfi/hassos-addons/discussions) for questions and general help

## License

This add-on repository is licensed under the [Apache License 2.0](LICENSE).
Duplicati itself is licensed under [LGPL](https://github.com/duplicati/duplicati/blob/master/LICENSE.txt).

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
