#!/bin/sh
# Puts EduHero back as before setup.sh: the gateway and inbox 3 point at Mirai's evolution-api again, and the
# EduHero-only containers are stopped and removed. Mirai is not touched. The new database volumes are kept
# (remove them by hand later: docker volume ls | grep eduhero).
set -eu
cd /opt/mirai-inbox
B=backup-20261019-evo-eduhero
test -d "$B" || { echo "no backup folder $B"; exit 1; }

if [ -f "$B/Caddyfile.public.before-route" ]; then
  cat "$B/Caddyfile.public.before-route" > Caddyfile.public
  docker compose exec -T public-gateway caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  echo "gateway back"
fi

ca_id=$(cut -d'|' -f1 "$B/inbox3-webhook.txt")
old_url=$(cut -d'|' -f2- "$B/inbox3-webhook.txt")
docker compose exec -T cw-postgres psql -U postgres -d chatwoot -At -v ON_ERROR_STOP=1 \
  -c "update channel_api set webhook_url = '$old_url' where id = $ca_id returning id, webhook_url"

if docker compose ps -q evolution-eduhero evo-eduhero-postgres 2>/dev/null | grep -q .; then
  docker compose stop evolution-eduhero evo-eduhero-postgres
  docker compose rm -f evolution-eduhero evo-eduhero-postgres
fi
cp -p "$B/docker-compose.yml" docker-compose.yml
[ -f evolution-eduhero.env ] && mv evolution-eduhero.env "$B/evolution-eduhero.env.removed"
docker compose config -q && echo "compose back"
