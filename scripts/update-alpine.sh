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
LOCK_DIR="/run/dsv-bordero-update.lock"
SERVICE_NEEDS_START=0
STASH_REF=""

case "$APP_DIR" in
  /root|/root/*)
    echo "DSV_APP_DIR è sotto /root. Spostare prima il repository in /opt/dsv-bordero."
    exit 1
    ;;
esac

HEALTH_HOST="${DSV_HOST:-127.0.0.1}"
case "$HEALTH_HOST" in
  0.0.0.0|::) HEALTH_HOST="127.0.0.1" ;;
esac
HEALTH_URL="http://${HEALTH_HOST}:${DSV_PORT:-3000}/api/health"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Un altro aggiornamento di DSV Borderò è già in esecuzione."
  exit 1
fi

cleanup() {
  code=$?
  trap - EXIT INT TERM
  if [ "$SERVICE_NEEDS_START" -eq 1 ]; then
    echo "L'aggiornamento non è terminato: provo a riavviare il servizio esistente."
    rc-service dsv-bordero start >/dev/null 2>&1 || true
  fi
  rmdir "$LOCK_DIR" 2>/dev/null || true
  exit "$code"
}
trap cleanup EXIT INT TERM

cd "$APP_DIR"

LOCAL_CHANGES="$(git status --porcelain)"
if [ -n "$LOCAL_CHANGES" ]; then
  STASH_MESSAGE="dsv-bordero-auto-update-$STAMP"
  echo "Salvataggio automatico delle modifiche locali..."
  git -c user.name="DSV Borderò updater" \
    -c user.email="dsv-bordero@localhost" \
    stash push --include-untracked -m "$STASH_MESSAGE"
  STASH_REF="$(git stash list -1 --format='%gd')"
  echo "Modifiche locali conservate in ${STASH_REF:-uno stash Git}."
fi

echo "Scaricamento dell'aggiornamento da GitHub..."
git pull --ff-only
chmod 0755 scripts/install-alpine.sh scripts/update-alpine.sh

SERVICE_NEEDS_START=1
rc-service dsv-bordero stop || true

mkdir -p "$DATA_DIR" "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/data-$STAMP.tar.gz" -C "$DATA_DIR" .

npm ci
npm run build

cp scripts/openrc/dsv-bordero.initd /etc/init.d/dsv-bordero
chmod 0755 /etc/init.d/dsv-bordero
if [ ! -f /etc/conf.d/dsv-bordero ]; then
  cp scripts/openrc/dsv-bordero.confd /etc/conf.d/dsv-bordero
fi
rc-update add dsv-bordero default >/dev/null

rc-service dsv-bordero start
SERVICE_NEEDS_START=0

attempt=0
while [ "$attempt" -lt 30 ]; do
  if wget -qO- "$HEALTH_URL" >/dev/null 2>&1; then
    trap - EXIT INT TERM
    rmdir "$LOCK_DIR" 2>/dev/null || true
    echo "Aggiornamento completato. Backup: $BACKUP_DIR/data-$STAMP.tar.gz"
    if [ -n "$STASH_REF" ]; then
      echo "Le precedenti modifiche locali sono recuperabili con: git stash apply $STASH_REF"
    fi
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 2
done

echo "Aggiornamento eseguito, ma il servizio non ha risposto in tempo."
echo "Controllare /var/log/dsv-bordero/error.log"
rc-service dsv-bordero status || true
tail -n 100 /var/log/dsv-bordero/error.log 2>/dev/null || true
exit 1
