# Home Assistant Add-on: Duplicati add-on

## About

[![Builder](https://github.com/adrianoamalfi/hassos-addons/actions/workflows/builder.yaml/badge.svg?branch=main)](https://github.com/adrianoamalfi/hassos-addons/actions/workflows/builder.yaml)
[![Lint](https://github.com/adrianoamalfi/hassos-addons/actions/workflows/lint.yaml/badge.svg)](https://github.com/adrianoamalfi/hassos-addons/actions/workflows/lint.yaml)

![Supports amd64 Architecture][amd64-shield]
![Supports armhf Architecture][armhf-shield]
![Supports armv7 Architecture][armv7-shield]
![Supports aarch64 Architecture][aarch64-shield]
![Supports i386 Architecture][i386-shield]

This Addon-on allows you to run [Duplicati](https://www.duplicati.com/) on a device running [Home Assistant](https://www.home-assistant.io/).

## Introduction

[Duplicati](https://www.duplicati.com/) is a free, open source, backup client that securely stores encrypted, incremental, compressed backups on cloud storage services and remote file servers.

It works with:

Amazon S3, IDrive e2, Backblaze (B2), Box, Dropbox, FTP, Google Cloud and Drive, HubiC, MEGA, Microsoft Azure and OneDrive, Rackspace Cloud Files, OpenStack Storage (Swift), Sia, Storj DCS, SSH (SFTP), WebDAV, Tencent Cloud Object Storage (COS), and more!

## Features

- Duplicati uses AES-256 encryption (or GNU Privacy Guard) to secure all data before it is uploaded.
- Duplicati uploads a full backup initially and stores smaller, incremental updates afterwards to save bandwidth and storage space.
- A scheduler keeps backups up-to-date automatically.
- Integrated updater notifies you when a new release is out
- Encrypted backup files are transferred to targets like FTP, Cloudfiles, WebDAV, SSH (SFTP), Amazon S3 and others.
- Duplicati allows backups of folders, document types like e.g. documents or images, or custom filter rules.
- Duplicati is available as application with an easy-to-use user interface and as command line tool.
- Duplicati can make proper backups of opened or locked files using the Volume Snapshot Service (VSS) under Windows or the Logical Volume Manager (LVM) under Linux. This allows Duplicati to back up the Microsoft Outlook PST file while Outlook is running.
- Filters, deletion rules, transfer and bandwidth options, etc

## Installation

Add the repository [https://github.com/adrianoamalfi/hassos-addons](https://github.com/adrianoamalfi/hassos-addons) in Home Assistant, see [https://www.home-assistant.io/hassio/installing_third_party_addons/](https://www.home-assistant.io/hassio/installing_third_party_addons/).

[![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fadrianoamalfi%2Fhassos-addons)

## Support

Got questions?

You could also [open an issue here](https://github.com/adrianoamalfi/hassos-addons/issues/new/choose) GitHub.

## Contributing

This is an active open-source project. We are always open to people who want to
use the code or contribute to it.

Thank you for being involved! :heart_eyes:

## Authors & contributors

The original setup of this repository is by [Adriano Amalfi](https://github.com/adrianoamalfi).

For a full list of all authors and contributors,
check [the contributor's page](https://github.com/adrianoamalfi/hassos-addons/graphs/contributors).

## License

Duplicati is licensed under LGPL and available for Windows and Linux. The software is open source and free to use, even commercially. More information about the LGPL licensing model can be found in License Agreement.

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
[armhf-shield]: https://img.shields.io/badge/armhf-yes-green.svg
[armv7-shield]: https://img.shields.io/badge/armv7-yes-green.svg
[i386-shield]: https://img.shields.io/badge/i386-yes-green.svg
