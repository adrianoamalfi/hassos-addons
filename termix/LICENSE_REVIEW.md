# Release licensing review — Termix 26.10.1

Review scope: the pinned upstream image used by Termix app 0.1.1, for amd64 and
aarch64. Upstream digest:
`sha256:3b893227a5a4bb45104b7ba07a7b4520b1b5c571a27eb08a32a7ea7a203712a5`.

## Termix, plugins and visual identity

The Apache 2.0 license and Copyright 2026 Luke Gustafson attribution are retained
in LICENSE and NOTICE and copied into `/usr/share/licenses/termix-ha/`.
The plugin SDK's original license is restored at `/app/packages/plugin-sdk/LICENSE`.
All 34 bundled plugin manifests and their exact release-tag licenses were checked;
their versions, source URLs and license hashes are in `licenses/plugins-sources.json`.
Their declared license is Apache-2.0; the shared Apache text is included.

The icon is the unchanged upstream SVG:
https://github.com/Termix-SSH/Termix/blob/v26.10.1/public/icon.svg.
SHA-256: `fe4859c31ec72702682c4d4211b94652f33c4cce3472de9bbbcad9eaec018bdf`.
The PNGs are rasterizations at 256 and 512 pixels. No separate asset license or
brand policy was found. Apache section 6 grants no trademark rights; the name and
graphics identify the software. The README and store description identify an
independent integration, without implying endorsement.

Adapted upstream JavaScript, HTML, nginx templates and entrypoint carry modification
notices. Original frontend and nginx files remain available in the image.
Existing bundled license comments are retained. Documentation screenshots use
synthetic hosts, credentials and files.

## JavaScript and frontend dependencies

The collector verified npm tarball integrity against the v26.10.1 upstream
lockfile for 982 unique archives. It collected 469 distinct notice groups, including
frontend dependencies classified upstream as devDependencies and font licenses.
These include development tools conservatively; the inventory is not a statement
that every lockfile package is shipped at runtime.

- `licenses/dependencies-NOTICES.md`: original license, copyright and notice texts.
- `licenses/dependencies-sources.json`: versions, source tarballs, integrity values
  and hashes of the notice files.
- `licenses/dependencies-coverage.json`: reviewed coverage for 55 packages without
  standalone notice files or embedded README license text.
- `licenses/npm-supplement.md`: six exact-version MIT notices recovered from
  original repository READMEs.
- `licenses/esbuild-LICENSE`: license for the same-version native esbuild bindings.

The 55 coverage entries use the same-version parent license for esbuild and
rolldown bindings, or an explicit SPDX grant in the integrity-verified package
manifest accompanied by the standard license text and available author metadata.
No copyright dates or ownership claims are invented. Three Apache declarations,
nine MIT declarations, one ISC declaration and one WTFPL declaration are covered
alongside the native binding groups. Original specific notices, where supplied,
remain in the collected material.

## Native libraries and corresponding source

The installed libvips component versions match sharp-libvips v1.3.4's version
properties on both architectures. The review downloaded 390 source archives and
patches, including 357 Rust crates from librsvg's Cargo.lock. Crate checksums were
verified. The collector found no source dependency without a license text or an
explicit package license declaration.

- `licenses/native-NOTICES.md`: original native and Rust notices; original
  Cargo.toml declarations and authors are retained when a crate omits a license file.
- `licenses/native-sources.json`: exact source URLs, archive hashes, version
  properties, crate declarations, patch contents and hashes.
- `licenses/libvips-build-posix.sh.txt` and version properties: preserved build inputs.
- LGPL 3.0, GPL 3.0 and MPL 2.0 texts accompany the original notices.
- `licenses/SOURCES.md`: how to obtain source and replace/rebuild the LGPL library.

Public source archives and the build inputs are referenced directly, including
the changes made by sharp-libvips. Maintain source availability for as long as
the corresponding binaries are distributed; mirror the recorded inputs if an
upstream source becomes unavailable.

Node.js v24.21.0's original LICENSE, including its incorporated-component notices,
is included with a pinned source reference and hash. All 115 Debian package
instances retain their distributor copyright files in the inspected image.
The integration does not remove system-package notices.

## Optional OPKSSH excluded

The upstream image contains OPKSSH v0.16.0. Its embedded Go build information
identifies `github.com/yeqown/reedsolomon@v1.0.0`, whose distributed source tag has
no LICENSE file or license declaration. The optional binary is removed from the
published app image pending upstream clarification. A fresh final image copies
the sanitized filesystem, preventing the excluded binary from remaining in
inherited OCI layers.

This does not affect SSH key/password authentication or SFTP. The optional
OPKSSH plugin needs a separately obtained upstream binary; it is not part of
this app's bundled-binary support. The excluded dependency can be inspected at:
https://github.com/yeqown/reedsolomon/tree/v1.0.0.

## Release checks and future updates

A build-time guard checks the upstream version, runtime package inventory, all
bundled plugins, native component versions, Node's license hash and absence of
the excluded binary. Changed versions fail the build until the review is updated.
The collectors are read-only; artifact writes occur separately.

Both architecture builds, license guards, startup tests, ingress/account/restore
tests and unit tests passed locally. HAOS 17.1 Supervisor partial backup and
restore passed, with a test marker restored and health returning HTTP 200.
SSH exec and SFTP upload/download with fingerprint verification passed against a
disposable real OpenSSH server on the VM's internal network. The server and test
marker were removed; the backups were retained.

The OCI Apache-2.0 label identifies the integration and Termix core. Other
components retain the licenses listed in the accompanying notices. This review
is tied to the recorded versions and sources; it grants no additional trademark
or third-party rights.
