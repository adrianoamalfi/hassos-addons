# Implementazione del repository multi app e Termix

13 ottobre 2026. Branch `dev/multi-app-termix`.

Modifiche nella [PR in bozza numero 108](https://github.com/adrianoamalfi/hassos-addons/pull/108).
La PR mostra lo stato aggiornato dei controlli GitHub.

Il repository ora scopre le app dalle rispettive directory e include Termix 0.1.0,
in fase sperimentale, basato su Termix 26.10.1. Le modifiche sono pronte per revisione;
l'installazione reale su HAOS resta una verifica necessaria prima del rilascio stabile.

## Modifiche realizzate

- Discovery da `config.yaml`, slug unici, architetture e versioni indipendenti.
- Build, lint e smoke test per app su runner GitHub nativi amd64 e arm64.
- Selezione delle app modificate; modifiche condivise verificano tutte le app.
- Rifiuto di modifiche al runtime di una app prive di un incremento versione.
- Pubblicazione su main soltanto dopo test e lint riusciti, usando le immagini già
  testate; release successive alla pubblicazione e prima release per nuove app.
- Script locali con `--addon`, parser YAML, volumi Docker per i test e deploy SSH
  selettivo. I comandi preesistenti continuano a usare Duplicati come default.
- Driver separati per aggiornamenti canary Duplicati e stable Termix. Il driver
  Termix verifica manifest multiarch e digest prima di preparare l'aggiornamento.
- PR bot con avvio esplicito di Builder in sola lettura; eliminato il precedente
  workflow di auto-approvazione con `pull_request_target`.

La pipeline usa direttamente Docker per conservare e pubblicare la stessa immagine
verificata. Sostituisce quindi l'azione `home-assistant/builder` precedentemente
pinnata. Versioni e architetture HA sono applicate come label durante la build.
Le release sperimentali sono marcate come prerelease.

## Integrazione Termix

L'immagine upstream è fissata al digest multiarch
`sha256:3b893227a5a4bb45104b7ba07a7b4520b1b5c571a27eb08a32a7ea7a203712a5`.
Il digest è passato separatamente a Docker perché il linter HA non accetta `@sha256`
nel campo `build_from`.

Il wrapper legge il percorso ingress dall'API Supervisor con ruolo default, poi
rimuove le credenziali Supervisor dall'ambiente del backend. Conserva database,
chiavi e plugin in `/data/termix`, senza montare cartelle HA o pubblicare porte LAN.
La configurazione richiede backup a freddo, con arresto dell'app da parte del
Supervisor durante il backup, per conservare una copia consistente del database.

Tre adattamenti sono necessari per il pannello HA:

1. Policy iframe same-origin, conservando le altre direttive CSP.
2. Filtro IP basato sulla connessione reale. La configurazione upstream degli IP
   inoltrati permetteva di aggirare il filtro tramite `X-Forwarded-For`.
3. Rimozione mirata del controllo upstream che tratta ogni iframe come login
   dell'app desktop. Un controllo sulla versione compilata interrompe l'avvio se
   questa implementazione cambia. I moduli adattati ricevono nuovi nomi per evitare
   il riuso delle vecchie risorse dalla cache del browser.

Frontend e template nginx vengono ripristinati prima di ogni avvio. I test verificano
anche che riavvii ripetuti non accumulino risorse frontend e non cambino le chiavi.
Il login Termix rimane attivo. Il desktop remoto richiede guacd e non fa parte del
supporto iniziale.

## Verifiche completate localmente

| Verifica | Risultato |
| --- | --- |
| Test Python delle automazioni | 7 riusciti |
| Test Node degli adattamenti Termix | 5 riusciti |
| Schemi ufficiali del linter HA | config e build validi per entrambe le app |
| Workflow GitHub Actions | actionlint 1.7.11 riuscito |
| Termix amd64 e aarch64 | build, avvio, salute, riavvio e chiavi persistenti riusciti |
| Ingress simulato | prefisso, asset, iframe, filtro IP e isolamento token riusciti |
| Backup e restore Termix | account creato e login riuscito dopo restore in un container nuovo |
| Browser reale con iframe | onboarding, login, creazione host e terminale SSH riusciti |
| Terminale SSH | connessione a un host sintetico e input `termix-ingress-ok` visibile |
| Duplicati aarch64 nativo | build e verifica UI/API riusciti |
| Duplicati amd64 sul Mac ARM | build riuscita; runtime instabile in emulazione, verificato con successo sulla CI nativa |
| Build e test GitHub su runner nativi | tutti e quattro i job riusciti |

I test usano account, chiavi e host sintetici. Container, reti e volumi temporanei
sono stati eliminati. Le immagini locali rimangono disponibili per ulteriori prove.

## Verifiche ancora necessarie

- Installazione dal repository e apertura attraverso il Supervisor HAOS reale.
- Backup/restore gestito da Home Assistant e aggiornamento dell'app installata.
- Upload/download SFTP verso un host reale e sessione SSH prolungata.

La VM locale HAOS 17.1 è stata avviata per la prova, ma SSH sulla porta 22 non era
disponibile. Nessuna app è stata installata nella VM; la VM è stata riportata allo
stato spento. Le prove completate sul proxy simulato non sostituiscono questi
controlli di installazione sul Supervisor reale.

## Comandi per provare Termix

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
export APP_PYTHON="$PWD/.venv/bin/python"
./scripts/local-build.sh --addon termix
./scripts/local-test.sh --addon termix --port 8081
```

Aprire `http://localhost:8081`. Il comando locale utilizza un volume persistente e
disattiva esplicitamente il filtro ingress soltanto in modalità di test, senza token
Supervisor. Per una prova HAOS con accesso SSH disponibile:

```bash
./scripts/deploy-vm.sh --addon termix --ip IP_DELLA_VM
```

Il deploy copia soltanto Termix nella directory delle app locali e rimuove il campo
`image` sulla copia remota, per consentire la build locale nel Supervisor.
