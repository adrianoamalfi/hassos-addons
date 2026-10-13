# Termix for Home Assistant

Manage SSH hosts, open interactive terminals and transfer files from Home Assistant.
Supports amd64 and aarch64. This app is experimental until its complete ingress and
backup flow has been verified on HAOS.

Install Termix from this repository and open its panel. Create a Termix account,
then install the SSH and file management plugins through Termix.

Termix authentication remains enabled. Home Assistant controls access to the panel;
Termix accounts control access to hosts and credentials. No LAN port is published.

See [configuration and backup instructions](DOCS.md).

Upstream: [Termix](https://github.com/Termix-SSH/Termix), Apache License 2.0.
