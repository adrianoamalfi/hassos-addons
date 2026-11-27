# AWTRIX Manager

AWTRIX Manager lets Home Assistant users monitor and manage AWTRIX NG displays
from the Home Assistant interface. It communicates with configured displays over
the local network and serves its UI through Home Assistant Ingress.

## Features

- View configured displays and their current status.
- Manage installed apps, including ordering, enabling, and disabling them.
- Edit and deploy Berry scripts with the built-in editor.
- Adjust display settings and manage device files.
- Export and restore device backups.

## Installation

Install the add-on from the Home Assistant Add-on Store, then start it and open
its panel from the sidebar.

## Configuration

Add each display under **Settings → Add-ons → AWTRIX Manager → Configuration**.
Use a hostname or address reachable from the add-on container.

```yaml
devices:
  - host: "awtrix-simulator.local"
    name: "AWTRIX Simulator"
```

The example uses a generic simulator hostname. Replace it with the hostname or
address of a device on your own network. Development setups can point to an
AWTRIX simulator reachable from the Home Assistant host.

Optional device fields are `tls`, `username`, and `password`.

## Access and data

The web interface is available through Home Assistant Ingress; the add-on does
not expose a separate host port. Backups and add-on state are stored in
`/data/awtrix`, which Home Assistant includes in add-on backups.

## Support

[Open an issue](https://github.com/adrianoamalfi/hassos-addons/issues/new/choose)
for bugs or feature requests.
