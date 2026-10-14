# Connect Termix to Home Assistant

Termix is an SSH client. Installing it in Home Assistant does not grant it a shell
on the HAOS host. Install a separate SSH app and configure an SSH key for the
connection. Keep SSH accessible only from your LAN or a private VPN.

## Choose your SSH app

| Setting | Terminal & SSH official | Advanced SSH & Web Terminal |
| --- | --- | --- |
| SSH username | `root` | Value of `ssh.username` |
| Public key setting | `authorized_keys` | `ssh.authorized_keys` |
| Port from the LAN | Value configured under Network for `22/tcp` | Value configured under Network for `22/tcp` |
| File manager | Verify SFTP support in the installed version before relying on it | Set `ssh.sftp: true`; upstream currently requires username `root` for SFTP |
| Hostname within the Supervisor network | Usually `core-ssh`; confirm in app information | Usually `a0d7b954-ssh`; confirm in app information |

The LAN port can differ from the container's port 22. Do not use an ingress web
URL as an SSH address. A hostname on the internal Supervisor network avoids
publishing a LAN port when the SSH daemon is reachable internally; test that
connection with your installed SSH app and its configuration.

## Create the connection

1. In Termix, create an SSH key credential. Keep the private key in Termix and copy
   only its public key to the chosen SSH app's authorized keys setting. Use a key
   type supported by that app's current version; the official app documents ECDSA.
2. Save the SSH app settings and restart that app.
3. Add a host in Termix named, for example, `Home Assistant`.
4. Use your HA machine's LAN address and the configured published SSH port, or the
   confirmed internal hostname and container port 22.
5. Set the username from the table and select the SSH key credential.
6. Open a terminal. Compare the host-key fingerprint with the SSH server before
   accepting it. Run `ha info` to verify access to the Home Assistant CLI.

Existing password authentication also works when the SSH app permits it, but this
guide uses keys. Do not disable SSH host-key checks or enable legacy algorithms as
a default. Changing a host's IP does not justify accepting an unexpected host key.

## Browse files

Enable File Manager in Termix. For Advanced SSH, enable SFTP using the upstream
requirements above. Browse the folders actually mounted in the SSH app, such as
`/config` and `/share`; available paths and write permissions depend on its settings.
An SFTP connection to an SSH app does not expose the entire HAOS filesystem.

Do not turn off protection mode merely to use Termix. Advanced SSH documents
additional privileges for some features; evaluate those features separately.

## Read-only snippets

Create snippets in Termix with these commands:

| Name | Command |
| --- | --- |
| Home Assistant status | `ha info` |
| Core status | `ha core info` |
| Supervisor status | `ha supervisor info` |
| Installed apps | `ha apps list` |
| Backup list | `ha backups list` |

The [JSON catalog](snippets/home-assistant-readonly.json) contains the same commands
for reference. It is not a Termix import file and is not loaded automatically.
These commands inspect state; they do not restart services, update software or
delete backups. Avoid publishing command output that contains private host details.

## Direct HAOS host access

Developer SSH on port `22222` is a separate service with full host privileges and
its own key installation procedure. It is unnecessary for normal Termix access
through an SSH app. Enable it only when you specifically need host diagnostics.

## Official references

- [Terminal & SSH](https://github.com/home-assistant/addons/blob/master/ssh/DOCS.md)
- [Advanced SSH & Web Terminal](https://github.com/hassio-addons/addon-ssh/blob/main/ssh/DOCS.md)
- [HAOS developer SSH](https://developers.home-assistant.io/docs/operating-system/debugging/)
- [Termix host configuration](https://docs.termix.site/guide/hosts)
