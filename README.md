# DSV Borderò

Web app self-hosted per importare etichette DSV, verificare le spedizioni e generare un unico borderò PDF. Funziona direttamente su Alpine Linux con Node.js, senza Docker e senza servizi cloud applicativi.

## Installazione rapida da GitHub su Alpine

Requisiti: Alpine Linux, accesso root e connessione Internet durante installazione e build.

```sh
apk add nodejs npm git
git clone https://github.com/OWNER/REPOSITORY.git /opt/dsv-bordero
cd /opt/dsv-bordero
npm ci
npm run build
```

Per installare il servizio OpenRC, creare le directory persistenti e avviare l'app:

```sh
chmod +x scripts/install-alpine.sh scripts/update-alpine.sh
./scripts/install-alpine.sh
```

L'app risponde su `http://127.0.0.1:3000` e viene avviata automaticamente insieme ad Alpine.

Il repository deve trovarsi in `/opt/dsv-bordero` o in un'altra directory attraversabile dall'utente di servizio. Non clonarlo sotto `/root`: OpenRC viene eseguito come utente isolato `dsv-bordero` e non potrebbe leggere la build.

La guida completa è disponibile in [INSTALL-ALPINE.md](INSTALL-ALPINE.md).

## Avvio manuale senza OpenRC

```sh
cd /opt/dsv-bordero
npm ci
npm run build
mkdir -p data
DSV_DATA_DIR="$PWD/data" npm start
```

`npm start` deve essere eseguito soltanto dopo `npm run build`.

## Dati locali

La directory configurata con `DSV_DATA_DIR` contiene:

- `dsv-bordero.sqlite`: storico, righe, numerazione e registro attività;
- `pdfs/`: PDF dei borderò generati;
- file SQLite `-wal` e `-shm`, necessari durante l'esecuzione.

Con l'installazione OpenRC la directory predefinita è `/var/lib/dsv-bordero`. Non cancellarla durante gli aggiornamenti e includerla nei backup.

I PDF originali selezionati vengono elaborati nel browser e non sono caricati sul server. PDF.js, il worker PDF e pdf-lib sono inclusi nel bundle: a runtime l'app non contatta CDN.

I nomi e gli indirizzi conservano caratteri internazionali e maiuscole/minuscole originali. I PDF incorporano localmente Noto Sans con subsetting, quindi testi come `Mühlenstraße`, `François` e `Łódź` restano fedeli senza dipendere da font o servizi esterni.

## Cloudflare Tunnel

Se `cloudflared` gira sullo stesso host Alpine:

```yaml
ingress:
  - hostname: bordero.example.it
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Se `cloudflared` gira in un altro container Proxmox, modificare `/etc/conf.d/dsv-bordero`:

```sh
DSV_HOST="0.0.0.0"
DSV_PORT="3000"
```

Riavviare quindi il servizio:

```sh
rc-service dsv-bordero restart
```

Limitare la porta 3000 tramite firewall al solo indirizzo del container `cloudflared`. Proteggere il dominio con Cloudflare Access: l'applicazione non implementa account propri.

## Aggiornamento da GitHub

```sh
cd /opt/dsv-bordero
./scripts/update-alpine.sh
```

Lo script arresta il servizio, salva un backup dei dati in `/var/backups/dsv-bordero`, esegue `git pull --ff-only`, aggiorna le dipendenze, ricompila e riavvia l'app.

## Sviluppo

```sh
npm install
npm run dev
```

Senza `DSV_DATA_DIR`, i dati vengono scritti nella directory locale `./data`.
