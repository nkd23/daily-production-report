#!/usr/bin/env bash
# Dump the PostgreSQL database to backups/ and keep the last 14 days.
# Runs daily from cron (installed by setup-server.sh); can also be run by hand.
#
# Restore into an EMPTY database:
#   gunzip -c backups/duy1-YYYY-MM-DD_HHMM.sql.gz | docker compose exec -T db psql -U duy1 -d duy1
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
. ./.env
set +a

mkdir -p backups
chmod 700 backups
file="backups/duy1-$(date +%F_%H%M).sql.gz"
docker compose exec -T db pg_dump -U "${DB_USER:-duy1}" -d "${DB_NAME:-duy1}" --no-owner | gzip > "$file"
find backups -name 'duy1-*.sql.gz' -mtime +14 -delete
echo "$(date '+%F %T') backup ok: $file ($(du -h "$file" | cut -f1))"
