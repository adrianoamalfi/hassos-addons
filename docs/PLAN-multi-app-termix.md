# Piano per più app Home Assistant e integrazione Termix

Analisi del 13 ottobre 2026, sul commit `f84be67`. Obiettivo: conservare Duplicati, aggiungere Termix e rendere build, test, aggiornamenti e release indipendenti per ogni app. Questo documento definisce il lavoro; il porting non è ancora implementato.

## Decisione proposta

Mantenere una directory per app nella radice: `duplicati/`, `termix/` e le future app. Home Assistant supporta già questo formato. Non servono nuovi repository, un nuovo store o una conversione a un monorepo con workspace Node.

Rendere generiche le operazioni comuni e lasciare nelle singole app runtime, test funzionali e regole di aggiornamento upstream. Usare `config.yaml` come fonte di slug, versione e architetture. Evitare un secondo catalogo che duplichi questi dati.

Primo rilascio Termix: UI web, account Termix, host SSH, terminale e trasferimento file attraverso i plugin necessari, amd64 e aarch64. Escludere inizialmente desktop remoto e `guacd`; documentare che i relativi plugin richiedono un componente aggiuntivo. Ingress deve superare una prova su HAOS prima di dichiarare pronta l'app.

## Stato e vincoli della codebase

| Area | Situazione attuale | Modifica necessaria |
| --- | --- | --- |
| Struttura HA | `repository.yaml` e `duplicati/` già compatibili con più app | Aggiungere `termix/` accanto a Duplicati |
| Builder | `.github/workflows/builder.yaml`: filtri `duplicati/**`, target `/data/duplicati`, matrice solo architetture | Discovery e matrice app × architetture dichiarate |
| Test CI | Builder ricostruisce Duplicati amd64 in un job separato; verifica HTTP e API Duplicati | Contratto di test per app; riutilizzare l'immagine costruita; conservare verifiche specifiche |
| Lint | `.github/workflows/lint.yaml` controlla solo `./duplicati` | Lint per app selezionata e controllo completo pianificato |
| Release | `.github/workflows/release.yaml` osserva solo `duplicati/config.yaml`, confronta `HEAD~1`; ignora prima versione | Release per app, confronto con il commit precedente al push, gestione prima pubblicazione |
| Ordine release | Release e Builder partono separatamente al push; startup test solo nelle PR | Pubblicare release dopo build e test riusciti per tutte le architetture dell'app |
| Update bot | `.github/workflows/check-updates.yaml` conosce solo canary Duplicati | Driver upstream separati e flusso comune di PR |
| Approvazione CI | `.github/workflows/auto-approve.yaml` riconosce solo `update-duplicati-*`; PR #107 ha run `action_required` | Individuare la causa prima di estendere il meccanismo a Termix |
| Script locali | Tutti i cinque script in `scripts/` assumono Duplicati, relativi argomenti e porte | Selettore `--addon`, parametri comuni e adattatori per app |
| Dependabot | Configurazione Docker soltanto per `/duplicati` | Aggiungere `/termix`, distinguendo base image e versione applicativa |
| Documentazione | README, CLAUDE.md, task editor e template riferiti al singolo add-on | Catalogo app, istruzioni per contribuire e convenzioni aggiornate |

Il pin di `home-assistant/builder@2026.03.2` deriva da una precedente correzione CI: conservarlo durante questa migrazione; eventuale aggiornamento va verificato separatamente. CLAUDE.md cita ancora linter 2.21.0 mentre il workflow usa 2.21.1.

## Automazioni per più app

### Discovery e selezione

1. Cercare directory di primo livello con `config.yaml` e `Dockerfile`; validare struttura, slug unico, versione e architetture.
2. Generare JSON per GitHub Actions con coppie `{addon, arch}`. Non assumere che tutte le app supportino entrambe le architetture.
3. Nelle PR confrontare base e head usando il merge base. Nei push usare `event.before` e `event.after`, gestendo il primo push senza commit precedente. Usare parsing YAML reale, evitando regex per configurazioni strutturate.
4. Cambiamenti a workflow, script comuni o metadati di discovery selezionano tutte le app; modifiche locali selezionano solo l'app coinvolta. Gestire rinomina, cancellazione, matrice vuota e modifiche soltanto documentali.
5. Prevedere esecuzione manuale per una app oppure tutte. Un job finale con nome stabile raccoglie lint, build e test, così i controlli obbligatori non dipendono dai nomi della matrice.

### Build e pubblicazione

- Parametrizzare percorso, slug, architettura e build args letti da `build.yaml`; non imporre argomenti Duplicati a Termix.
- Conservare immagini `ghcr.io/adrianoamalfi/{arch}-addon-{slug}` coerenti con `config.yaml`.
- PR: build e test senza pubblicazione, con permessi di lettura e senza credenziali GHCR.
- Main: build, test e pubblicazione con permessi espliciti `packages: write`; registrare digest per architettura. Eseguire test sull'immagine effettivamente destinata alla pubblicazione.
- Eseguire almeno startup e salute per entrambe le architetture, su runner nativo o emulazione. Limitare concorrenza per app e versione; una build fallita non deve produrre una release annunciata come pronta.

### Release e aggiornamenti

- Versione add-on indipendente dalla versione upstream. Duplicati mantiene i tag `duplicati-v{version}`; Termix userà `termix-v{version}`.
- Per una nuova app creare anche la prima release. Consentire retry idempotente se una parte della pubblicazione era già riuscita.
- Estrarre il blocco changelog tra il titolo esatto della versione e il titolo successivo: gestire correttamente anche l'ultima sezione e versioni con punti.
- Driver Duplicati: conservare canale e data release. Driver Termix: release stabile e verifica disponibilità immagine per le architetture richieste. Non seguire `main` o `latest` nelle build pubblicate.
- Branch update `update-{slug}-{upstream-version}`. Chiudere soltanto vecchie PR della stessa app e dello stesso bot; un aggiornamento Termix non deve chiudere PR Duplicati.
- I workflow con `pull_request_target` non devono eseguire codice o script del branch della PR con token privilegiati. Verificare autore, repository head, SHA e workflow ammessi. Valutare credenziali GitHub App per attivare CI normalmente, se l'attuale flusso con `GITHUB_TOKEN` non lo consente.

## Porting Termix

### Baseline upstream verificata

La release più recente osservata è [v26.10.1](https://github.com/Termix-SSH/Termix/releases/tag/v26.10.1), pubblicata il 12 ottobre 2026. Licenza Apache 2.0. Il [workflow Docker della release](https://github.com/Termix-SSH/Termix/blob/v26.10.1/.github/workflows/docker.yml) dichiara `linux/amd64` e `linux/arm64`; verificare il manifest del tag effettivamente scelto prima del pin.

Il [Dockerfile upstream](https://github.com/Termix-SSH/Termix/blob/v26.10.1/docker/Dockerfile) usa Node 24 Debian slim, nginx e moduli nativi, con salute backend su `30001/health`. La UI usa normalmente porta 8080. L'[entrypoint](https://github.com/Termix-SSH/Termix/blob/v26.10.1/docker/entrypoint.sh) avvia nginx, configura utenti e dati, quindi esegue il processo Node. Non è un container basato su S6/Bashio.

### Immagine e avvio

Prima scelta da provare: immagine add-on derivata dall'immagine ufficiale Termix, fissata a versione e digest multiarch, con un piccolo wrapper HA. È il percorso con meno duplicazione di dipendenze e build upstream. Non copiare il Dockerfile Duplicati né presupporre Bashio disponibile.

Il wrapper legge `/data/options.json` con un parser disponibile nell'immagine, prepara persistenza e proxy ingress, imposta le variabili supportate e delega all'avvio upstream. Verificare `init`, propagazione SIGTERM, arresto pulito di Node e nginx e permessi dell'utente runtime. Se serve una supervisione diversa, sceglierla dopo questa prova; evitare due sistemi init sovrapposti.

Alternativa se immagine upstream e builder HA non risultano compatibili: build multistage dal tag upstream con toolchain e dipendenze native documentate. Non copiare `node_modules` tra basi con ABI o librerie incompatibili.

### Ingress e login

I [requisiti HA ingress](https://developers.home-assistant.io/docs/add-ons/presentation/#ingress) comprendono WebSocket e accesso al listener soltanto dal proxy Supervisor `172.30.32.2`. Il percorso viene trasmesso nell'header `X-Ingress-Path`.

Termix [supporta `BASE_PATH`](https://docs.termix.site/configure/reverse-proxy), ma lo inserisce nel frontend all'avvio. Occorre risolvere come ottenere il prefisso HA prima dell'avvio oppure applicarlo per richiesta. Preferire una soluzione nativa verificata; in alternativa valutare un adattamento del proxy limitato ai metadati frontend. Non assumere che un prefisso fisso funzioni per sessioni diverse.

La [configurazione nginx upstream](https://github.com/Termix-SSH/Termix/blob/v26.10.1/docker/nginx.conf) contiene `X-Frame-Options: DENY` e CSP `frame-ancestors 'none'`: blocca l'iframe HA. Adattare soltanto la policy di embedding necessaria e conservarne le altre direttive, verificando anche eventuali header backend. Validare asset, router, redirect, cookie, service worker, API e WebSocket con il prefisso effettivo.

Mantenere il login Termix: autenticazione HA protegge l'accesso al pannello, ma non crea automaticamente un account Termix o le sue autorizzazioni. Non riutilizzare il bypass PreAuth di Duplicati. Primo rilascio via ingress, senza porta LAN pubblicata; client desktop/mobile e accesso diretto saranno un'estensione da progettare.

### Persistenza e sicurezza

- Fare confluire `/app/data` in `/data/termix`, verificando se basta `DATA_DIR` o serva un collegamento/mapping interno: l'entrypoint contiene anche percorsi `/app/data` espliciti.
- Conservare insieme database cifrato e `.env` con le chiavi. La [documentazione backup](https://docs.termix.site/install/backup) precisa che senza quelle chiavi il database non si apre. Includere plugin e configurazioni; definire anche il comportamento di upload e file temporanei.
- Avviare servizi con utente senza privilegi dove compatibile, limitando preparazione dei permessi al bootstrap. Valutare AppArmor sulle connessioni SSH e SFTP, plugin e directory realmente usati.
- Non richiedere Docker socket, host network, accesso API Home Assistant o montaggi di config, ssl, addons e backup per la prima versione. Termix deve poter raggiungere gli host remoti in rete senza accedere ai dati HA.
- Verificare backup consistente del database, arresto e ripristino su installazione nuova. Un rollback dopo una migrazione schema deve usare backup e chiavi compatibili, non soltanto una vecchia immagine.

### File da aggiungere

In `termix/`: `config.yaml`, `build.yaml`, `Dockerfile`, wrapper/runtime in `rootfs/` se necessario, `README.md`, `DOCS.md`, `CHANGELOG.md`, traduzioni inglese/italiano, icona/logo e profilo AppArmor se richiesto. Versione iniziale proposta `0.1.0`, slug `termix`, architetture `amd64` e `aarch64`, `ingress: true`, porta ingress corrispondente al listener verificato.

Mantenere opzioni iniziali minime, per esempio livello log se upstream lo consente. Generare e conservare segreti nei dati dell'app; non inserire credenziali SSH nei default o nei log Supervisor.

### Desktop remoto in una fase successiva

Il [README upstream](https://github.com/Termix-SSH/Termix) presenta un servizio `guacd` separato, necessario per il plugin desktop remoto. HA non esegue un Docker Compose allegato all'app. Se richiesto, valutare una seconda app `guacd` con connessione interna oppure un singolo container con processo aggiuntivo supervisionato. Verificare compatibilità architetture, storage condiviso, registrazioni e trasferimenti prima di scegliere. Non dichiarare funzionante il desktop remoto nella versione iniziale.

## Piano di implementazione

| Fase | Risultato | Criterio di completamento |
| --- | --- | --- |
| 1. Prova Termix su HAOS | Installazione locale di prova dal tag fissato | Login in iframe, asset e API corretti, terminale SSH via WebSocket, trasferimento file, arresto/riavvio e dati persistenti |
| 2. Contratto comune | Discovery, parser YAML e script con `--addon` | Duplicati continua a funzionare; seconda app selezionata senza riferimenti hardcoded; slug sconosciuto rifiutato |
| 3. CI per più app | Lint/build/test per app e architettura, controlli aggregati | PR Duplicati verifica Duplicati; PR Termix verifica Termix; modifica comune verifica entrambe; PR non pubblica immagini |
| 4. App Termix | Directory definitiva e documentazione di installazione | amd64 e aarch64 avviabili; installazione da store HA, ingresso protetto, restore recupera account e credenziali |
| 5. Release e update | Release dopo validazione immagini; updater Termix stabile | Prima release creata, aggiornamenti indipendenti, retry sicuro, CI delle PR bot eseguita |
| 6. Verifica finale | Prova end-to-end su HAOS e regressione Duplicati | Installazione, aggiornamento e restore verificati; catalogo documentato; limiti dei plugin espliciti |

Suddividere il lavoro in PR: infrastruttura comune; Termix con prova ingress; automazioni release/update. Fare la prova della fase 1 prima di investire nel porting completo: un container sano via HTTP non dimostra che l'interfaccia funzioni dentro HA.

## Test che devono guidare il lavoro

- Discovery: nuova app, modifica di due app nello stesso push, workflow comune, architetture differenti e nessuna app selezionata.
- Release: prima versione, bump indipendente, push con più commit, ultima sezione changelog, build fallita e retry dopo pubblicazione parziale.
- Termix: creazione admin, plugin SSH e file manager, host con chiave SSH, console interattiva e ridimensionamento, sessione inattiva senza disconnessione prematura, upload/download.
- Ingress: accesso HA locale e remoto, sessioni distinte, refresh di route interna, URL fuori prefisso, cookie e service worker, restrizione IP sul listener.
- Dati: restart, update, backup e restore completo con `.env`, autorizzazioni e credenziali ancora utilizzabili.
- Regressione Duplicati: due architetture, nginx ingress, API di salute e configurazione corrente invariati nel comportamento.

## Ordine consigliato

Partire dalla prova ingress Termix, quindi rendere generici builder/lint/script e inserire l'app definitiva. Completare pubblicazione e aggiornamenti soltanto dopo i test su HAOS. Il repository non richiede una ristrutturazione profonda: il lavoro principale è rendere riutilizzabili le automazioni e adattare il runtime Termix al Supervisor.
