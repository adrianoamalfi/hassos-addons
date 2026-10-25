# Source access and library replacement

The integration code is available in the repository containing this document.
Termix source is https://github.com/Termix-SSH/Termix/tree/v26.10.1.
Plugin source tags and their licenses are recorded in plugins-sources.json.
JavaScript package source archives and integrity values are in dependencies-sources.json.

For libvips and incorporated libraries, native-sources.json records the source
archives, their SHA-256 values, the Rust Cargo.lock dependencies and applied patches.
Those source archives can be downloaded without charge from the recorded upstream
servers. The preserved build script and version properties describe the
sharp-libvips v1.3.4 inputs, options and library changes. Additional platform build
files are available at https://github.com/lovell/sharp-libvips/tree/v1.3.4.

The shared libvips library dynamically loaded by sharp is located at:

- aarch64: /app/node_modules/@img/sharp-libvips-linux-arm64/lib/libvips-cpp.so.8.18.7
- amd64: /app/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.7

Users may rebuild this library from the recorded source, preserving the expected
ABI, and replace it in a derived container image. The application does not use
signatures or integrity restrictions that prevent replacement of that library.
Its Apache terms do not prohibit reverse engineering needed to debug changes to
the LGPL components. Preserve source, licensing and modification notices in any
redistributed derivative.

Node's source reference and original license are recorded in node-sources.json
and node-LICENSE. Debian distributor copyright files remain under /usr/share/doc;
package versions and source-package identities can be inspected with dpkg-query
and their sources obtained from Debian's source archives or snapshot service.

Maintainers must keep equivalent source access available while the corresponding
binaries remain available. If an upstream source disappears, mirror the recorded
source and build inputs alongside the binary distribution. A GitHub release alone
does not replace these obligations.
