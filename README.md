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

### [Termix](./termix)

SSH terminals and file transfers through the Home Assistant panel, using Termix
26.10.1. Supports amd64 and aarch64. Experimental: HAOS ingress and backup acceptance
checks are still required. Termix login remains enabled; remote desktop requires a
separate guacd service. See [Termix documentation](./termix/DOCS.md).

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

## Development

Each app lives in its own top-level directory. Discovery reads `config.yaml`; CI
builds and tests the selected app for each declared architecture. Changes to shared
scripts or workflows verify every app. Version bumps publish the tested images,
then create independent releases such as `duplicati-v1.1.4` and `termix-v0.1.0`.

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
export APP_PYTHON="$PWD/.venv/bin/python"
./scripts/local-build.sh --addon termix
./scripts/local-test.sh --addon termix --port 8081
./scripts/deploy-vm.sh --addon termix --ip 192.168.64.2
```

Local test containers expose their UI on localhost only. Termix local test mode
disables ingress IP filtering explicitly; Supervisor installations always enable it.
Local app data uses a named Docker volume by default; `--data-dir` opts into a host
directory. Duplicati also starts a small Supervisor metadata fixture for Bashio.
Automated checks use `"$APP_PYTHON" scripts/apps.py test --addon termix`. Upstream updates
use `./scripts/check-updates.sh --addon termix`; Duplicati remains the default.

See [contributor instructions](CONTRIBUTING.md) for adding another app.

## License

This add-on repository is licensed under the [Apache License 2.0](LICENSE).
Duplicati itself is licensed under [LGPL](https://github.com/duplicati/duplicati/blob/master/LICENSE.txt).

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
