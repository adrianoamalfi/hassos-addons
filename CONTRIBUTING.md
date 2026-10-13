# Adding and maintaining Home Assistant apps

Add a top-level directory with `config.yaml`, `build.yaml`, `Dockerfile`, README,
DOCS and CHANGELOG. Use a unique slug and a quoted app version. The shared tooling
currently supports amd64 and aarch64; declare only architectures you can test.

Use `build.yaml` for architecture-specific base images and build arguments. Pin
upstream applications to releases and digests. The common builder passes these
arguments plus BUILD_ARCH and BUILD_VERSION. Images follow the `image` field in
`config.yaml`; use `ghcr.io/adrianoamalfi/{arch}-addon-{slug}`.

Install the Python dependencies in scripts/requirements.txt. Build/run/test tools
accept `--addon`; their default is Duplicati for existing local commands. For
isolated smoke tests run `python scripts/apps.py test --addon <directory>`.
Add application-specific behavior checks to tests when basic HTTP startup cannot
prove the app works. Apps with another HTTP port need an adapter in apps.py.

PRs build and lint selected apps on native amd64/arm64 runners without registry credentials. Shared changes test
all apps. Main publishes only apps with a changed version, including first releases;
all selected builds and lint must pass before publication. Releases follow successful
publication. Manual Builder runs validate apps without publishing anything.

Bump each app independently and include a matching changelog section:

```bash
./scripts/bump-version.sh --addon termix --version 0.1.1 --message 'Describe the change.'
./scripts/check-updates.sh --addon termix
```

Runtime changes require a version bump to reach users. Documentation-only and shared
tooling changes can run validation without overwriting an existing image version.
Discovery rejects app runtime changes without a version bump.
Configure branch protection to require `App build checks`; that check includes lint.

The updater has separate Duplicati and Termix drivers. To automate a future app,
add a driver to scripts/upstream.py and the check-updates matrix. Bot PRs explicitly
dispatch Builder on their branch because GITHUB_TOKEN events may not trigger CI.
Those runs have read-only repository permissions and cannot publish images/releases.

For HAOS acceptance verify installation, iframe login, prefixed assets/routes,
WebSocket interactions, restart, upgrade and backup/restore. Mark a new app
experimental until these checks pass. Termix must preserve its encrypted database
and .env keys together; it must not receive the Supervisor token in its backend.
