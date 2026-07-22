# Installazione nativa su Alpine

Questa procedura non usa Docker. Next.js viene compilato e avviato direttamente con Node.js; OpenRC mantiene il processo attivo e lo avvia al boot.

## Requisiti

- Alpine Linux con accesso root;
- Node.js 22.13 o successivo;
- connessione a GitHub e al registro npm durante installazione e aggiornamenti;
- porta locale 3000 disponibile.

Il repository non deve trovarsi sotto `/root`. Usare `/opt/dsv-bordero`, perché il servizio viene eseguito con l'utente non privilegiato `dsv-bordero`.

## Installazione automatica

```sh
apk add nodejs npm git
git clone https://github.com/OWNER/REPOSITORY.git /opt/dsv-bordero
cd /opt/dsv-bordero
chmod +x scripts/install-alpine.sh scripts/update-alpine.sh
./scripts/install-alpine.sh
```

Lo script esegue anche `npm ci` e `npm run build`, crea l'utente di sistema `dsv-bordero`, registra il servizio OpenRC e prepara `/var/lib/dsv-bordero`.

## Installazione manuale

Compilare l'app:

```sh
apk add nodejs npm git
git clone https://github.com/OWNER/REPOSITORY.git /opt/dsv-bordero
cd /opt/dsv-bordero
npm ci
npm run build
```

Verificare manualmente il funzionamento:

```sh
mkdir -p /var/lib/dsv-bordero
DSV_DATA_DIR=/var/lib/dsv-bordero npm start
```

Per l'uso continuativo è raccomandato il servizio OpenRC incluso in `scripts/openrc`.

## Configurazione OpenRC

Il file `/etc/conf.d/dsv-bordero` controlla i percorsi e l'ascolto di rete:

```sh
DSV_APP_DIR="/opt/dsv-bordero"
DSV_DATA_DIR="/var/lib/dsv-bordero"
DSV_HOST="127.0.0.1"
DSV_PORT="3000"
```

Comandi utili:

```sh
rc-service dsv-bordero status
rc-service dsv-bordero restart
tail -f /var/log/dsv-bordero/error.log
wget -qO- http://127.0.0.1:3000/api/health
```

## Aggiornamento

```sh
cd /opt/dsv-bordero
./scripts/update-alpine.sh
```

La procedura crea prima un archivio in `/var/backups/dsv-bordero`, poi esegue:

```sh
git pull --ff-only
npm ci
npm run build
```

Database e PDF restano in `/var/lib/dsv-bordero`, fuori dal repository Git.

## Cloudflared

Se il tunnel gira sullo stesso host, lasciare `DSV_HOST="127.0.0.1"` e puntare a `http://127.0.0.1:3000`.

Se il tunnel gira in un altro container Proxmox, impostare `DSV_HOST="0.0.0.0"`, riavviare il servizio e consentire tramite firewall l'accesso alla porta 3000 esclusivamente dall'indirizzo privato del container cloudflared.

## Backup manuale

```sh
rc-service dsv-bordero stop
tar -czf "dsv-bordero-data-$(date +%Y%m%d-%H%M).tar.gz" -C /var/lib/dsv-bordero .
rc-service dsv-bordero start
```
