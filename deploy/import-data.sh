#!/usr/bin/env bash
# Load a data export (made with `python -m tools.transfer_data export ...` on
# the old machine) into the server's database. Refuses if data already exists.
#   bash deploy/import-data.sh data-export.json
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?Usage: bash deploy/import-data.sh data-export.json}"

docker compose exec -T backend python -m tools.transfer_data import /dev/stdin < "$FILE"
echo "Da nap xong. Nho xoa file $FILE (chua ma bam mat khau): rm $FILE"
