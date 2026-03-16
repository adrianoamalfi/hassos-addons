# Home Assistant Add-on: Duplicati

[![Builder](https://github.com/adrianoamalfi/hassos-addons/actions/workflows/builder.yaml/badge.svg?branch=main)](https://github.com/adrianoamalfi/hassos-addons/actions/workflows/builder.yaml)
[![Lint](https://github.com/adrianoamalfi/hassos-addons/actions/workflows/lint.yaml/badge.svg)](https://github.com/adrianoamalfi/hassos-addons/actions/workflows/lint.yaml)

![Supports amd64 Architecture][amd64-shield]
![Supports aarch64 Architecture][aarch64-shield]

Backup your Home Assistant data to the cloud with [Duplicati](https://www.duplicati.com/) — a free, open-source backup client with AES-256 encryption, incremental backups, and a built-in scheduler.

[![Add repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fadrianoamalfi%2Fhassos-addons)

## About

This add-on runs Duplicati as a native .NET application inside Home Assistant, with a web UI fully integrated through HA's ingress system. No additional ports or authentication needed — just open the add-on panel from your sidebar.

### Supported cloud storage

Amazon S3, IDrive e2, Backblaze B2, Box, Dropbox, FTP, Google Cloud & Drive, MEGA, Microsoft Azure & OneDrive, Rackspace Cloud Files, OpenStack Storage (Swift), Sia, Storj DCS, SSH (SFTP), WebDAV, Tencent COS, and more.

### Features

- **AES-256 encryption** — all data is encrypted before leaving your device
- **Incremental backups** — only changed data is uploaded after the first full backup
- **Built-in scheduler** — set it and forget it with automatic backup scheduling
- **Cloud & local targets** — back up to any combination of cloud services and local/network storage
- **Flexible filtering** — include/exclude folders, file types, or custom filter rules
- **Web UI in Home Assistant** — access everything from the HA sidebar via ingress

### Accessible HA folders

This add-on can back up the following Home Assistant folders:

| Folder | Path | Description |
|--------|------|-------------|
| Config | `/config` | HA configuration (YAML, automations, scripts) |
| Media | `/media` | Media files |
| Share | `/share` | Shared data between add-ons |
| SSL | `/ssl` | SSL certificates |
| Add-ons | `/addons` | Local add-on files |
| Backup | `/backup` | HA backup snapshots (excluded from Duplicati backups by default to avoid recursion) |

## Installation

1. Add this repository to Home Assistant:
   - Go to **Settings > Add-ons > Add-on Store**
   - Click **⋮** (top right) > **Repositories**
   - Add: `https://github.com/adrianoamalfi/hassos-addons`
2. Find **Duplicati** in the add-on store and click **Install**
3. Start the add-on and click **Open Web UI**

## Architecture

```
Browser → HA Ingress → nginx (:8080) → Duplicati (:8200)
```

The add-on uses nginx as a reverse proxy to handle Home Assistant's ingress authentication and URL rewriting. Both the new Duplicati UI (ngclient) and legacy UI (ngax) are fully supported.

## Support

- [Open an issue](https://github.com/adrianoamalfi/hassos-addons/issues/new/choose) for bugs or feature requests
- [Changelog](./CHANGELOG.md) for version history

## Contributing

Contributions are welcome! Feel free to open a PR or issue.

## Authors & contributors

Created and maintained by [Adriano Amalfi](https://github.com/adrianoamalfi).

See [all contributors](https://github.com/adrianoamalfi/hassos-addons/graphs/contributors).

## License

This add-on is licensed under the [Apache License 2.0](https://github.com/adrianoamalfi/hassos-addons/blob/main/LICENSE).
Duplicati is licensed under [LGPL](https://github.com/duplicati/duplicati/blob/master/LICENSE.txt).

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
