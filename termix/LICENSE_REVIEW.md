# Licensing review — 2026-10-13

## Termix and visual identity

Pinned upstream: Termix v26.10.1, image digest
`sha256:3b893227a5a4bb45104b7ba07a7b4520b1b5c571a27eb08a32a7ea7a203712a5`.
The upstream Apache 2.0 license and copyright attribution are included in LICENSE
and copied into `/usr/share/licenses/termix-ha/` with NOTICE.

The icon is the unmodified SVG from
https://github.com/Termix-SSH/Termix/blob/v26.10.1/public/icon.svg.
SHA-256 of the upstream SVG:
`fe4859c31ec72702682c4d4211b94652f33c4cce3472de9bbbcad9eaec018bdf`.
The PNGs are rasterizations at 256 and 512 pixels. No separate asset license or
brand policy was found during this review. Apache 2.0 section 6 does not grant
trademark rights; names and graphics identify the integrated software, and the
README explicitly identifies this as an independent integration. No endorsement
or broader trademark permission is claimed.

Adapted JavaScript, HTML, nginx templates and entrypoint carry modification notices.
The wrapper preserves pristine upstream frontend and nginx files in the image.
Screenshots show the upstream UI with synthetic data from the local test fixture.

## Dependency review: incomplete

An initial inspection of `/app/node_modules` in the aarch64 image found 279
package instances: 228 MIT, 15 ISC, 12 BlueOak, 6 Apache 2.0, 6 BSD 3-Clause,
2 MPL 2.0, and one each LGPL 3+, Python 2.0, BSD 2-Clause, 0BSD and Unlicense.
Five packages omit the license field but retain a LICENSE file:
buildcheck, busboy, cpu-features, ssh2 and streamsearch.

Ten package instances lack a LICENSE/COPYING/NOTICE file at the package root:

- @esbuild/linux-arm64 0.28.2
- @img/sharp-libvips-linux-arm64 1.3.4 (LGPL-3.0-or-later)
- assert-plus 1.0.0
- cookie-signature 1.0.6
- drizzle-orm 0.45.3
- https-proxy-agent 5.0.1
- agent-base 6.0.2
- lazy-val 1.0.5
- pg-types 2.2.0
- pgpass 1.0.5

Absence at the package root does not prove absence elsewhere or a license
violation. It requires checking the distributed image and upstream artifacts.
Before declaring the image cleared for public release:

1. Locate and preserve exact-version third-party copyright and license texts.
2. Check libvips and bundled native libraries for LGPL notices, corresponding
   source availability and relinking requirements; check MPL source availability.
3. Review installed plugins, frontend bundles, system packages and the amd64
   image separately. The counts above do not cover those components.
4. Record source locations and hashes for any added notices or source archives.

The OCI Apache-2.0 label describes the integration and Termix core, not every
component. This is a technical review record, not a complete legal clearance.
Keep the PR draft until the remaining licensing and HAOS acceptance checks close.
