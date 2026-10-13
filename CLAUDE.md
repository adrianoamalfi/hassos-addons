# Repository guidance

Home Assistant app repository. Each top-level app directory is independent:

- `duplicati/`: add-on 1.1.4, Duplicati 2.4.0.103 canary, .NET and nginx with S6.
- `termix/`: experimental app 0.1.0, Termix 26.10.1, upstream Node/nginx image and HA wrapper.

Both support amd64 and aarch64. Read each app's DOCS.md before changing its runtime.

## Development

Install `scripts/requirements.txt` in a virtualenv and set APP_PYTHON to its Python
binary when invoking shell wrappers. All local commands default to Duplicati for
compatibility and accept `--addon termix` or another discovered app.

```bash
./scripts/local-build.sh --addon termix
./scripts/local-test.sh --addon termix --port 8081
./scripts/bump-version.sh --addon termix --version 0.1.1 --message 'Describe changes.'
./scripts/check-updates.sh --addon termix
./scripts/deploy-vm.sh --addon termix --ip 192.168.64.2
python scripts/apps.py test --addon termix
python -m unittest discover -s tests -v
node --test tests/termix-runtime.test.cjs
python tests/test-termix-ingress.py
```

Ingress integration test uses the built `local/termix:latest` image and an isolated
mock Supervisor on a temporary Docker network. It cleans up its containers/network.
Automated smoke tests use disposable named volumes. Interactive local commands keep
their named data volumes and expose only localhost ports.

## CI and releases

`builder.yaml` discovers apps from config.yaml, selects changed directories and
builds/tests each app architecture using the Docker CLI. Shared tooling/workflow
changes select all apps. An aggregate `App build checks` job is suitable for branch
protection. Lint is included in Builder; `lint.yaml` also runs full lint daily.

Only push events on main can publish. Only apps with changed versions, including
new apps, publish tested image artifacts after all builds/tests/lint pass. Release
jobs then create `{slug}-v{version}` tags. Manual Builder runs are read-only tests.
Experimental app releases are prereleases. Do not overwrite a published app version
for a runtime update: bump config.yaml and add its changelog section.

`check-updates.yaml` has independent Duplicati and Termix drivers in upstream.py.
Termix stable updates require a multiarch image manifest and digest before PR
preparation. Update PRs explicitly dispatch read-only Builder because bot-token
events may not trigger follow-up workflows. No pull_request_target approval job.

## Runtime constraints

Duplicati uses nginx :8080 -> Duplicati :8200. Its nginx generates a persistent
PreAuth token and a frontend URL shim for ingress. Duplicati data stays under
`/data/duplicati`, root-owned mode 700. Mounted HA folders are read/write, with
`/backup` excluded from recursive add-on backups. AppArmor includes only the
capabilities needed by Duplicati and its folder permissions.

Termix uses its native BASE_PATH, obtained from `/addons/self/info` with the default
Supervisor role. The wrapper removes the Supervisor token before running upstream
services, adapts iframe policy and enforces ingress source IP using the actual peer
address. Restore pristine frontend/nginx templates at every boot so prefix changes
and restarts work. Keep Termix login enabled. No HA folder mounts or host privileges.
Persistent Termix data and encryption keys stay together under `/data/termix`.
Remote desktop needs guacd and is outside the initial supported feature set.

## Conventions

Use descriptive commits (`fix`, `feat`, `docs`, `ci`, `build(deps)`) and independent
semantic app versions. Upstream versions live in each app's build.yaml. Preserve
existing app behavior when modifying shared automation. See CONTRIBUTING.md and
docs/PLAN-multi-app-termix.md for the architecture and remaining HAOS acceptance work.
