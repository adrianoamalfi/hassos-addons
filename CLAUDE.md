# CLAUDE.md

## Panoramica del Progetto

Repository di add-on Home Assistant contenente **Duplicati**, un client di backup open-source con crittografia AES-256. L'add-on consente backup incrementali e compressi su cloud (S3, B2, Google Drive, Dropbox, OneDrive, Azure, FTP, SFTP, WebDAV, ecc.) con interfaccia web integrata in Home Assistant via ingress.

- **Maintainer**: Adriano Amalfi
- **Licenza**: Apache 2.0
- **Registry**: `ghcr.io/adrianoamalfi/{arch}-addon-duplicati`
- **Repo**: https://github.com/adrianoamalfi/hassos-addons

## Struttura del Progetto

```
├── duplicati/                    # Add-on Duplicati
│   ├── config.yaml               # Configurazione add-on HA (versione, porte, volumi, permessi)
│   ├── build.yaml                # Base images e build args (DUPLICATI_VERSION, CHANNEL, DATE)
│   ├── Dockerfile                # Installa Tempio, nginx e Duplicati .NET nativo
│   ├── rootfs/                   # Filesystem overlay nel container
│   │   ├── etc/services.d/duplicati/  # Script S6-overlay Duplicati (run, finish)
│   │   ├── etc/services.d/nginx/      # Script S6-overlay nginx (run, finish)
│   │   └── usr/bin/
│   │       ├── start_duplicati        # Script avvio Duplicati server (porta 8200)
│   │       └── start_nginx            # Script avvio nginx reverse proxy (porta 8080)
│   ├── translations/             # Traduzioni UI (en.yaml, it.yaml)
│   ├── apparmor.txt              # Profilo sicurezza AppArmor
│   ├── CHANGELOG.md / DOCS.md / README.md
│   └── icon.png / logo.png
├── scripts/                      # Automazione locale
│   ├── check-updates.sh          # Controlla nuove release Duplicati canary
│   ├── bump-version.sh           # Aggiorna versione addon/Duplicati
│   ├── local-build.sh            # Build Docker locale
│   ├── local-test.sh             # Esegue container locale per test
│   └── deploy-vm.sh              # Deploy addon su VM UTM con HA OS via rsync/SSH
├── .github/workflows/
│   ├── builder.yaml              # CI: build Docker multi-arch + push GHCR + test container
│   ├── lint.yaml                 # CI: linting addon
│   ├── release.yaml              # CI: crea GitHub Release su version bump
│   └── check-updates.yaml        # CI: controlla aggiornamenti Duplicati (daily), crea PR
├── .github/CODEOWNERS
├── .github/dependabot.yaml
├── repository.yaml
└── .devcontainer.json
```

## Architetture Supportate

amd64, aarch64 — base images Debian Bookworm da `ghcr.io/home-assistant/`.
Mapping Duplicati: amd64→x64, aarch64→arm64.

## Comandi di Sviluppo

### Script locali
```bash
./scripts/check-updates.sh                    # Controlla nuove release canary
./scripts/bump-version.sh --version 1.2.0 --duplicati-version 2.2.0.107 --duplicati-date 2026-04-01
./scripts/local-build.sh                      # Build Docker locale (auto-detect arch)
./scripts/local-test.sh                       # Esegue su http://localhost:8080
./scripts/deploy-vm.sh                        # Deploy su VM UTM (auto-detect IP da VM "HAOS")
./scripts/deploy-vm.sh --ip 192.168.64.5      # IP manuale se auto-detect non disponibile
```

### Dev container
- **Immagine**: `ghcr.io/home-assistant/devcontainer:addons`
- **Avvio HA locale**: `sudo -E supervisor_run`
- **Porte**: 7123 (UI HA), 7357 (API)

### CI/CD
- **builder.yaml**: Push/PR su `main` (path: `duplicati/**`). Matrice 2 arch. Su `main` pubblica GHCR, su PR test (`--test`) + container startup test.
- **lint.yaml**: Push/PR/schedule giornaliero. `frenck/action-addon-linter@v2.21.0`.
- **release.yaml**: Push su `main` (path: `duplicati/config.yaml`). Se `version` cambia, crea GitHub Release con tag `duplicati-v{version}`.
- **check-updates.yaml**: Schedule giornaliero + manual. Controlla canary su GitHub API, crea PR automatica se update disponibile.
- **Dependabot**: Aggiorna GitHub Actions e Docker base images settimanalmente.
- **CODEOWNERS**: `@adrianoamalfi` owner di tutti i file.

## Convenzioni

### Commit Messages
Formato emoji-prefixed:
- `feat ✨:` — nuove funzionalita
- `fix 🐛:` — bug fix
- `chore 📦:` — aggiornamento dipendenze
- `⬆️ build(deps):` — bump dipendenze CI/Duplicati

### Versionamento
Semantic Versioning. La versione addon e in `config.yaml`, la versione Duplicati in `build.yaml`.

### Rilascio (automatizzato)
1. `./scripts/bump-version.sh` per aggiornare versioni
2. Commit e PR su `main`
3. Merge triggera: build Docker → push GHCR → GitHub Release automatica
4. Gli aggiornamenti Duplicati vengono proposti automaticamente via `check-updates.yaml`

## Dettagli Tecnici

### Architettura Runtime
```
Browser → HA Ingress Proxy → nginx (:8080) → Duplicati (:8200)
```
- **nginx** su porta 8080 (ingress port): reverse proxy, PreAuth injection, JS shim per URL rewriting
- **Duplicati** su porta 8200 (interno): server .NET nativo self-contained
- **S6-overlay** gestisce entrambi i servizi (nginx + duplicati)
- **Tempio** (v2024.11.2): template engine di Home Assistant
- **Canale aggiornamento**: canary
- **URL download**: `https://updates.duplicati.com/{channel}/duplicati-{VER}_{channel}_{DATE}-linux-{arch}-gui.deb`

### Ingress / nginx
- PreAuth token generato al primo avvio, salvato in `/data/secrets.json`
- nginx inietta `Authorization: PreAuth <token>` header verso Duplicati
- JS shim (`ingress-fix.js`) patcha fetch/XHR/WebSocket per prefissare URL con ingress path
- `X-Forwarded-Prefix` header abilita proxy-config nella nuova UI (ngclient)
- `X-Allow-Iframe-Hosting` disabilita frame-busting per iframe HA

### Dati persistenti
- `/data/duplicati/` — database, configurazione
- `/data/duplicati/scripts/` — script utente
- `/data/secrets.json` — pre-auth token

### Volumi montati (tutti read-write)
`config`, `ssl`, `media`, `addons`, `share`, `backup`

### Sicurezza
- Privilegio richiesto: `DAC_READ_SEARCH`
- Profilo AppArmor personalizzato per Duplicati e nginx
- Esclusione backup: `/backup` (evita ricorsione)

### File chiave da modificare per aggiornamenti
| Cosa aggiornare | File |
|---|---|
| Versione add-on | `duplicati/config.yaml` → `version` |
| Versione Duplicati | `duplicati/build.yaml` → `args.DUPLICATI_VERSION` |
| Canale Duplicati | `duplicati/build.yaml` → `args.DUPLICATI_CHANNEL` |
| Data release Duplicati | `duplicati/build.yaml` → `args.DUPLICATI_DATE` |
| Versione Tempio | `duplicati/build.yaml` → `args.TEMPIO_VERSION` |
| Base image Debian | `duplicati/build.yaml` → `build_from` |
| Changelog | `duplicati/CHANGELOG.md` |
