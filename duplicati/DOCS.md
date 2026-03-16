# Home Assistant Add-on: Duplicati

## About

This add-on runs [Duplicati](https://www.duplicati.com/) on your Home Assistant instance, allowing you to create encrypted, incremental backups of your HA data to cloud storage or remote servers.

## How it works

The add-on runs Duplicati as a native .NET application with an nginx reverse proxy for seamless integration with Home Assistant's ingress system. No extra ports or separate authentication required.

```
Browser → HA Ingress → nginx → Duplicati
```

## Supported storage backends

Amazon S3, IDrive e2, Backblaze B2, Box, Dropbox, FTP, Google Cloud & Drive, MEGA, Microsoft Azure & OneDrive, Rackspace Cloud Files, OpenStack Storage (Swift), Sia, Storj DCS, SSH (SFTP), WebDAV, Tencent COS, and more.

## Accessible folders

| Folder | Path in Duplicati | Description |
|--------|-------------------|-------------|
| Config | `/config` | HA configuration files |
| Media | `/media` | Media files |
| Share | `/share` | Shared data between add-ons |
| SSL | `/ssl` | SSL certificates |
| Add-ons | `/addons` | Local add-on source files |
| Backup | `/backup` | HA backup snapshots |

> **Note:** The `/backup` folder is excluded from Duplicati backups by default to prevent recursion (backing up backups of backups).

## Quick start

1. Install and start the add-on
2. Click **Open Web UI** to access Duplicati
3. Click **Add backup** to create your first backup job
4. Choose a storage backend and configure your destination
5. Select the folders you want to back up (e.g., `/config`)
6. Set a schedule and encryption passphrase
7. Save and run your first backup

## Tips

- **Always set an encryption passphrase** — your backups will be encrypted with AES-256 before upload
- **Back up `/config` at minimum** — this contains all your HA automations, scripts, and settings
- **Test restoring** — verify that your backups work by restoring a test file
- **Use the scheduler** — set daily or weekly automatic backups so you never forget
- **Exclude large/temporary files** — use filters to skip cache folders or large media files you don't need to back up

## Support

Found a bug or need help? [Open an issue on GitHub](https://github.com/adrianoamalfi/hassos-addons/issues/new/choose).
