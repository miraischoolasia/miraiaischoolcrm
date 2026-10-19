#!/bin/bash
# Before/after check: does anybody see or do anything different once the team migrations are on?
# Needs Docker and an image with every migration BEFORE 20261026000000 applied (see README.md).
#   supabase/tests/permissions_no_change/run.sh <image>
# Scratch containers only; never point this at the live database.
set -e
IMAGE=${1:?image with the migrations before 20261026000000}
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
OUT=${OUT:-$(mktemp -d)}
C=permissions-no-change
PSQL="docker exec -i $C psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q"
docker rm -f $C >/dev/null 2>&1 || true
docker run -d --name $C -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
until docker exec $C pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 2
$PSQL < "$HERE/seed.sql"
$PSQL -At < "$HERE/capture.sql" > "$OUT/before.txt"
for f in $(ls "$ROOT/supabase/migrations" | sort); do
  [[ "$f" < "20261026000000" ]] && continue
  $PSQL < "$ROOT/supabase/migrations/$f"
done
$PSQL -At < "$HERE/capture.sql" > "$OUT/after.txt"
docker rm -f $C >/dev/null
python "$HERE/compare.py" "$OUT"
