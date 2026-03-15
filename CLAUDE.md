# CLAUDE.md

## Panoramica del Progetto

Repository di add-on Home Assistant contenente **Duplicati**, un client di backup open-source con crittografia AES-256. L'add-on consente backup incrementali e compressi su cloud (S3, B2, Google Drive, Dropbox, OneDrive, Azure, FTP, SFTP, WebDAV, ecc.) con interfaccia web integrata in Home Assistant via ingress.

- **Maintainer**: Adriano Amalfi
- **Licenza**: Apache 2.0
- **Registry**: `ghcr.io/adrianoamalfi/{arch}-addon-duplicati`
- **Repo**: https://github.com/adrianoamalfi/hassos-addons

## Struttura del Progetto

```
├── duplicati/                    # L'add-on Duplicati
│   ├── config.yaml               # Configurazione add-on HA (versione, porte, volumi, permessi)
│   ├── build.yaml                # Immagini base Docker e build args (TEMPIO_VERSION, DUPLICATI_VERSION)
│   ├── Dockerfile                # Installa Tempio, Mono, Duplicati, fix certificati B2
│   ├── rootfs/                   # Filesystem overlay nel container
│   │   ├── etc/services.d/duplicati/  # Script S6-overlay (run, finish)
│   │   └── usr/bin/start_duplicati    # Script avvio Duplicati server
│   ├── translations/             # Traduzioni UI (en.yaml, it.yaml)
│   ├── CHANGELOG.md              # Storico versioni
│   ├── DOCS.md                   # Documentazione funzionalita
│   ├── apparmor.txt              # Profilo sicurezza AppArmor
│   ├── icon.png / logo.png       # Risorse grafiche
│   └── README.md                 # Documentazione add-on
├── .github/workflows/
│   ├── builder.yaml              # CI: build Docker multi-arch e push su GHCR
│   └── lint.yaml                 # CI: linting add-on con frenck/action-addon-linter
├── repository.yaml               # Metadati repository HA
└── .devcontainer.json            # Dev container per sviluppo locale
```

## Architetture Supportate

amd64, aarch64 — base images Debian Bookworm da `ghcr.io/home-assistant/`.
Le architetture a 32-bit (armv7, armhf, i386) sono state rimosse in quanto deprecate dal builder HA (v2025.11.0+).

## Comandi e Workflow di Sviluppo

### Build locale (dev container)
Il progetto include `.devcontainer.json` con immagine `ghcr.io/home-assistant/devcontainer:addons`.
- **Avvio HA locale**: `sudo -E supervisor_run` (task VSCode "Start Home Assistant")
- **Porte dev**: 7123 (UI HA), 7357 (API)

### CI/CD
- **builder.yaml**: Triggerato da push/PR su `main`. Rileva add-on modificati con `git diff` nativo controllando i file: `build.yaml`, `config.yaml`, `Dockerfile`, `rootfs/`. Build in matrice 2 architetture (amd64, aarch64). Su `main` pubblica su GHCR, su PR solo test (`--test`).
- **lint.yaml**: Triggerato da push, PR e schedule giornaliero. Usa `frenck/action-addon-linter@v2.21.0`.
- **Dependabot**: Aggiorna GitHub Actions e Docker base images settimanalmente.
- **CODEOWNERS**: `@adrianoamalfi` come owner di tutti i file.

### Linting
Non c'e linter locale configurato. Il linting avviene in CI via `frenck/action-addon-linter`.

## Convenzioni

### Commit Messages
Formato emoji-prefixed:
- `feat ✨:` — nuove funzionalita
- `fix 🐛:` — bug fix
- `chore 📦:` — aggiornamento dipendenze
- `⬆️ build(deps):` — bump dipendenze CI
- `🖥️` — aggiornamenti sistema/OS

### Versionamento
Semantic Versioning (es. 0.2.0). La versione viene aggiornata in `duplicati/config.yaml` (`version`) e documentata in `duplicati/CHANGELOG.md`.

### Rilascio di una nuova versione
1. Aggiornare `version` in `duplicati/config.yaml`
2. Aggiornare la versione Duplicati in `duplicati/build.yaml` (`args.DUPLICATI_VERSION`) se cambiata
3. Aggiornare `duplicati/CHANGELOG.md` con le modifiche
4. Merge su `main` triggera la build e il push delle immagini Docker

## Dettagli Tecnici

### Runtime
- **Duplicati** gira su **Mono** (.NET runtime, pacchetto `mono-runtime`)
- **S6-overlay** gestisce la supervisione del processo
- **Tempio** (v2024.11.2): template engine di Home Assistant
- **Porta ingress**: 8200 (web UI Duplicati)
- **Dati persistenti**: `/data/duplicati/` (database, configurazione)
- **Script utente**: `/data/duplicati/scripts/`

### Volumi montati (tutti read-write)
`config`, `ssl`, `media`, `addons`, `share`, `backup`

### Sicurezza
- Privilegio richiesto: `DAC_READ_SEARCH`
- Profilo AppArmor personalizzato per Duplicati (Mono runtime, volumi montati, accesso rete)
- Esclusione backup: `/backup` (evita ricorsione)
- Fix certificato DST Root CA X3 per compatibilita Backblaze B2
- GPG keyring per repo Mono in `/usr/share/keyrings/` (metodo `signed-by`)

### File chiave da modificare per aggiornamenti
| Cosa aggiornare | File |
|---|---|
| Versione add-on | `duplicati/config.yaml` → `version` |
| Versione Duplicati | `duplicati/build.yaml` → `args.DUPLICATI_VERSION` |
| Versione Tempio | `duplicati/build.yaml` → `args.TEMPIO_VERSION` |
| Base image Debian | `duplicati/build.yaml` → `build_from` |
| Changelog | `duplicati/CHANGELOG.md` |
| Traduzioni | `duplicati/translations/{lang}.yaml` |
