#!/usr/bin/env bash
# One-shot setup on a fresh Ubuntu 24.04 server (e.g. Oracle Cloud Always Free).
# Run from the repository folder:
#   sudo bash deploy/setup-server.sh tennhamay.duckdns.org
# Safe to re-run: keeps the existing .env (and so the database password).
set -euo pipefail

DOMAIN="${1:?Usage: sudo bash deploy/setup-server.sh <ten-mien>   (vi du: tennhamay.duckdns.org)}"
[ "$(id -u)" -eq 0 ] || { echo "Hay chay bang sudo."; exit 1; }
cd "$(dirname "$0")/.."
REPO_DIR="$(pwd)"

echo "== 1/5 Cai Docker =="
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker.io docker-compose-v2
  systemctl enable --now docker
fi
docker compose version

echo "== 2/5 Mo cong 80/443 trong tuong lua cua may ao =="
# Oracle's Ubuntu images ship iptables rules that reject everything but SSH,
# separately from the Security List configured in the Oracle web console.
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
done
if command -v netfilter-persistent >/dev/null 2>&1; then netfilter-persistent save; fi

echo "== 3/5 Tao file .env (mat khau database + SECRET_KEY ngau nhien) =="
if [ ! -f .env ]; then
  (
    umask 077
    {
      echo "DOMAIN=$DOMAIN"
      echo "DB_PASSWORD=$(openssl rand -hex 24)"
      echo "SECRET_KEY=$(openssl rand -hex 48)"
    } > .env
  )
  echo "Da tao .env moi."
else
  sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" .env
  echo ".env da co san - giu nguyen mat khau, chi cap nhat DOMAIN."
fi

echo "== 4/5 Build va chay (lan dau mat khoang 5-10 phut) =="
docker compose up -d --build

echo "== 5/5 Sao luu database tu dong luc 01:30 moi ngay =="
cat > /etc/cron.d/duy1-backup <<EOF
30 1 * * * root cd $REPO_DIR && bash deploy/backup.sh >> /var/log/duy1-backup.log 2>&1
EOF

echo
echo "Dang cho HTTPS san sang tai https://$DOMAIN ..."
for _ in $(seq 1 60); do
  if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    echo "XONG: https://$DOMAIN da chay."
    exit 0
  fi
  sleep 5
done
echo "Chua truy cap duoc https://$DOMAIN sau 5 phut. Kiem tra:"
echo "  - Ten mien DuckDNS da tro dung IP cua may ao chua"
echo "  - Security List tren Oracle da mo cong 80 va 443 chua"
echo "  - Log: docker compose logs --tail=50 caddy backend"
exit 1
