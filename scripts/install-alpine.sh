#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Eseguire questo script come root."
  exit 1
fi

if [ ! -f /etc/alpine-release ]; then
  echo "Questo programma di installazione è destinato ad Alpine Linux."
  exit 1
fi

APP_DIR="${DSV_APP_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
DATA_DIR="${DSV_DATA_DIR:-/var/lib/dsv-bordero}"
SERVICE_USER="dsv-bordero"

case "$APP_DIR" in
  /root|/root/*)
    echo "Il repository è sotto /root e non può essere letto dall'utente dsv-bordero."
    echo "Spostarlo prima in /opt/dsv-bordero e rilanciare lo script."
    exit 1
    ;;
esac

apk add --no-cache nodejs npm git

node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<13)){console.error("Serve Node.js 22.13 o successivo.");process.exit(1)}'

if ! grep -q "^${SERVICE_USER}:" /etc/group; then
  addgroup -S "$SERVICE_USER"
fi
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  adduser -S -D -H -s /sbin/nologin -G "$SERVICE_USER" "$SERVICE_USER"
fi

cd "$APP_DIR"
npm ci
npm run build

mkdir -p "$DATA_DIR" /var/log/dsv-bordero
chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR" /var/log/dsv-bordero
chmod 0750 "$DATA_DIR" /var/log/dsv-bordero

cp scripts/openrc/dsv-bordero.initd /etc/init.d/dsv-bordero
chmod 0755 /etc/init.d/dsv-bordero

if [ ! -f /etc/conf.d/dsv-bordero ]; then
  cp scripts/openrc/dsv-bordero.confd /etc/conf.d/dsv-bordero
fi

sed -i "s|^DSV_APP_DIR=.*|DSV_APP_DIR=\"$APP_DIR\"|" /etc/conf.d/dsv-bordero
sed -i "s|^DSV_DATA_DIR=.*|DSV_DATA_DIR=\"$DATA_DIR\"|" /etc/conf.d/dsv-bordero

. /etc/conf.d/dsv-bordero
HEALTH_HOST="$DSV_HOST"
case "$HEALTH_HOST" in
  0.0.0.0|::) HEALTH_HOST="127.0.0.1" ;;
esac
HEALTH_URL="http://${HEALTH_HOST}:${DSV_PORT}/api/health"

rc-update add dsv-bordero default >/dev/null
rc-service dsv-bordero restart

attempt=0
while [ "$attempt" -lt 30 ]; do
  if wget -qO- "$HEALTH_URL" >/dev/null 2>&1; then
    echo "DSV Borderò installato e operativo su $HEALTH_URL"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 2
done

echo "Il servizio non ha risposto in tempo. Controllare: rc-service dsv-bordero status"
echo "Log: /var/log/dsv-bordero/error.log"
rc-service dsv-bordero status || true
tail -n 100 /var/log/dsv-bordero/error.log 2>/dev/null || true
exit 1
