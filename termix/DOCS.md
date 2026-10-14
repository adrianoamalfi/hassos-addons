# Termix configuration

For SSH access to Home Assistant itself, follow [the connection guide](HOME_ASSISTANT.md).

## First startup

Open the app through Home Assistant ingress, create the administrator account and
install the SSH and file management plugins. Add a reachable SSH host and test its
credentials. No configuration options are required.

The app reads its own ingress URL from the Supervisor API using the default role.
It removes the Supervisor token before starting Termix. It does not need Home
Assistant API access, host networking, the Docker socket or HA folder mounts.

## Persistent data and backup

Termix stores its database, encryption keys, plugins and settings in `/data/termix`.
Home Assistant includes this directory in app backups. Cold backup mode asks the
Supervisor to stop Termix while backing it up. Keep the database and its
`.env` keys together: losing the keys makes the encrypted database unreadable.
For manual copies, stop the app before copying this directory. Test restoring a
Home Assistant backup before relying on it for recovery.

Upstream's inherited `/app/data` Docker volume is unused by this wrapper. Application
bootstrap and data paths are redirected to the Supervisor-managed `/data/termix`.

## Supported access

The first release supports the web UI through ingress only. Login remains required.
Desktop/mobile clients and a direct LAN endpoint are not part of this release.
The ingress listener accepts Supervisor and loopback connections only.

The pinned frontend has a targeted adaptation: upstream treats all iframes as its
desktop login bridge, whereas Home Assistant embeds the entire app. The wrapper
removes that fallback and verifies exactly one matching implementation at startup.
An upstream change to this code fails startup and requires review before updating.
Adapted JavaScript modules use new filenames so browsers cannot reuse cached modules
from the unmodified upstream frontend. Pristine assets are restored on each boot.

## Remote desktop

RDP/VNC through the Remote Desktop plugin requires `guacd`, which is not included.
Do not enable those features unless you separately configure a compatible service.
SSH and file transfers do not need `guacd`.

## Updates

The app version and Termix version are independent. The upstream image is pinned to
a release and digest. Back up before updating; restore the matching backup if an
upstream database migration prevents a rollback.
