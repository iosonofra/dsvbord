#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Eseguire questo script come root."
  exit 1
fi

if [ -f /etc/conf.d/dsv-bordero ]; then
  . /etc/conf.d/dsv-bordero
fi

APP_DIR="${DSV_APP_DIR:-/opt/dsv-bordero}"
DATA_DIR="${DSV_DATA_DIR:-/var/lib/dsv-bordero}"
BACKUP_DIR="${DSV_BACKUP_DIR:-/var/backups/dsv-bordero}"
STAMP="$(date +%Y%m%d-%H%M%S)"

cd "$APP_DIR"
rc-service dsv-bordero stop

mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/data-$STAMP.tar.gz" -C "$DATA_DIR" .

git pull --ff-only
npm install
npm run build

rc-service dsv-bordero start

attempt=0
while [ "$attempt" -lt 30 ]; do
  if wget -qO- "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    echo "Aggiornamento completato. Backup: $BACKUP_DIR/data-$STAMP.tar.gz"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 2
done

echo "Aggiornamento eseguito, ma il servizio non ha risposto in tempo."
echo "Controllare /var/log/dsv-bordero/error.log"
exit 1
