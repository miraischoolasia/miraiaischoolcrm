#!/bin/sh
# EduHero's own Evolution next to Mirai's (2026-10-19).
#
# Why: EduHero's number could not be linked ("Couldn't link device"). Since about 2026-07-28 WhatsApp retires an
# unpaired companion's adv secret with a companion_reg_refresh notification, and Baileys 7.0.0-rc.9 (inside
# Evolution 2.3.7) only acks it, so the QR on screen is built on a retired secret. The fix (evolution-api PR #2727,
# Baileys PR #2765, both unmerged) is applied to this one Baileys file: baileys-rc9-socket.pairfix.patch.
# Mirai's Evolution is NOT changed: EduHero gets its own container with the same pinned image plus the patched file.
#
# Touches nothing of Mirai: evolution-api, evo-postgres, redis, the mirai-test instance and Mirai's part of
# Caddyfile.public stay as they are, and nothing of Mirai is restarted.
#
# Run on the server as root, one step at a time:
#   sh setup.sh backup | files | start | instance | route | check
# Undo: sh rollback.sh
# Needs, next to it: patches/baileys-rc9-socket.pairfix.js (the patched Baileys file).
set -eu
cd /opt/mirai-inbox
B=backup-20261019-evo-eduhero
NEW_WEBHOOK=http://evolution-eduhero:8080/chatwoot/webhook/eduhero

# Evolution's API through the public-gateway container (it has the API key in its environment; the key is never
# printed). evo <host> <GET|POST> <path> [json]
evo() {
  docker compose exec -T public-gateway sh -c '
    if [ "$2" = GET ]; then
      wget -qO- --header "apikey: $AUTHENTICATION_API_KEY" "http://$1:8080$3"
    else
      wget -qO- --header "apikey: $AUTHENTICATION_API_KEY" --header "Content-Type: application/json" --post-data "$4" "http://$1:8080$3"
    fi' sh "$1" "$2" "$3" "${4:-}"
}

cw_sql() {
  docker compose exec -T cw-postgres psql -U postgres -d chatwoot -At -v ON_ERROR_STOP=1 -c "$1"
}

mirai_started() {
  docker inspect "$(docker compose ps -q evolution-api)" --format '{{.State.StartedAt}}'
}

case "${1:-}" in
backup)
  test ! -e "$B" || { echo "$B already exists; stopping"; exit 1; }
  mkdir -m 700 "$B"
  cp -p docker-compose.yml Caddyfile.public evolution.env "$B/"
  cw_sql "select ca.id, ca.webhook_url from inboxes i join channel_api ca on ca.id = i.channel_id where i.id = 3" > "$B/inbox3-webhook.txt"
  mirai_started > "$B/mirai-evolution-startedat.txt"
  # The old eduhero instance's Chatwoot settings (holds EduHero's Chatwoot token, hence 600).
  evo evolution-api GET /chatwoot/find/eduhero > "$B/old-eduhero-chatwoot.json"
  chmod 600 "$B"/*
  echo "inbox 3 now: $(cat "$B/inbox3-webhook.txt")"
  echo "Mirai evolution-api started: $(cat "$B/mirai-evolution-startedat.txt")"
  ls -la "$B"
  ;;

files)
  test -d "$B" || { echo "run backup first"; exit 1; }
  test -s patches/baileys-rc9-socket.pairfix.js || { echo "patches/baileys-rc9-socket.pairfix.js is missing"; exit 1; }
  test ! -e evolution-eduhero.env || { echo "evolution-eduhero.env already exists; stopping"; exit 1; }
  pw=$(openssl rand -hex 24)
  umask 077
  {
    echo "SERVER_PORT=8080"
    echo "SERVER_URL=http://evolution-eduhero:8080"
    grep '^AUTHENTICATION_API_KEY=' evolution.env
    echo "POSTGRES_PASSWORD=$pw"
    echo "DATABASE_PROVIDER=postgresql"
    echo "DATABASE_CONNECTION_URI=postgresql://postgres:$pw@evo-eduhero-postgres:5432/evolution?schema=public"
    echo "DATABASE_CONNECTION_CLIENT_NAME=evolution_eduhero"
    echo "DATABASE_SAVE_DATA_INSTANCE=true"
    echo "DATABASE_SAVE_DATA_NEW_MESSAGE=true"
    echo "DATABASE_SAVE_DATA_CONTACTS=true"
    echo "DATABASE_SAVE_DATA_CHATS=true"
    echo "DATABASE_SAVE_DATA_LABELS=true"
    echo "DATABASE_SAVE_DATA_HISTORIC=true"
    echo "CACHE_REDIS_ENABLED=false"
    echo "CACHE_LOCAL_ENABLED=true"
    echo "CHATWOOT_ENABLED=true"
    grep '^CHATWOOT_IMPORT_DATABASE_CONNECTION_URI=' evolution.env
    echo "CONFIG_SESSION_PHONE_CLIENT=EduHero Inbox"
    echo "CONFIG_SESSION_PHONE_NAME=Chrome"
    echo "QRCODE_LIMIT=8"
  } > evolution-eduhero.env
  python3 - <<'PY'
import pathlib
p = pathlib.Path("docker-compose.yml")
text = p.read_text()
assert "evolution-eduhero:" not in text
services = """  # EduHero's own Evolution (2026-10-19): same pinned image as evolution-api, plus the Baileys fix for
  # "Couldn't link device" (patches/baileys-rc9-socket.pairfix.js). Own database, no Redis, nothing shared with
  # Mirai's evolution-api. Set up by whatsapp-sender/evolution-eduhero/setup.sh in the CRM repo.
  evolution-eduhero:
    image: evoapicloud/evolution-api@sha256:966625532d9076a2381e973a271307d107e6f070450de3abeeea8bd18be07252
    env_file: evolution-eduhero.env
    depends_on: [evo-eduhero-postgres]
    volumes:
      - evo_eduhero_instances:/evolution/instances
      - ./patches/evolution-main.js:/evolution/dist/main.js:ro
      - ./patches/baileys-rc9-socket.pairfix.js:/evolution/node_modules/baileys/lib/Socket/socket.js:ro
    restart: unless-stopped

  evo-eduhero-postgres:
    image: postgres@sha256:7e2070cf6ad06fb3cbbd141b1bafbb7fd5bb63e2b6001e6daf34448eb555e4b3
    env_file: evolution-eduhero.env
    environment:
      POSTGRES_DB: evolution
      POSTGRES_USER: postgres
    volumes:
      - evo_eduhero_pgdata:/var/lib/postgresql/data
    restart: unless-stopped

"""
marker = "\nvolumes:\n"
assert text.count(marker) == 1
text = text.replace(marker, "\n" + services + "volumes:\n  evo_eduhero_instances:\n  evo_eduhero_pgdata:\n", 1)
p.write_text(text)
PY
  docker compose config -q && echo "compose OK"
  diff "$B/docker-compose.yml" docker-compose.yml | grep -c '^>' | sed 's/^/compose lines added: /'
  ;;

start)
  before=$(mirai_started)
  docker compose up -d --no-deps evo-eduhero-postgres
  i=0; until docker compose exec -T evo-eduhero-postgres pg_isready -U postgres -q; do i=$((i+1)); [ $i -lt 30 ] || { echo "postgres not ready"; exit 1; }; sleep 2; done
  docker compose up -d --no-deps evolution-eduhero
  i=0; until evo evolution-eduhero GET / 2>/dev/null | grep -q '"status":200'; do i=$((i+1)); [ $i -lt 60 ] || { echo "evolution-eduhero did not answer"; docker compose logs --tail 40 evolution-eduhero; exit 1; }; sleep 3; done
  evo evolution-eduhero GET / | head -c 200; echo
  [ "$(mirai_started)" = "$before" ] && echo "Mirai evolution-api untouched (started $before)" || echo "WARNING: Mirai evolution-api start time changed"
  ;;

instance)
  # qrcode false: creating it does not start a pairing (no QR until someone asks for one).
  evo evolution-eduhero POST /instance/create '{"instanceName":"eduhero","integration":"WHATSAPP-BAILEYS","qrcode":false,"groupsIgnore":false,"syncFullHistory":false,"alwaysOnline":false,"readMessages":false,"readStatus":false,"rejectCall":false}' \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print("created:", d["instance"]["instanceName"], d["instance"]["status"])'
  # Chatwoot: the existing inbox 3 "EduHero WhatsApp" (autoCreate false, found by name), no history import.
  body=$(python3 -c '
import json
old = json.load(open("'"$B"'/old-eduhero-chatwoot.json"))
assert old.get("token") and str(old.get("accountId")) == "2" and old.get("nameInbox") == "EduHero WhatsApp"
print(json.dumps({"enabled": True, "accountId": "2", "token": old["token"], "url": "http://chatwoot-rails:3000",
  "signMsg": False, "reopenConversation": True, "conversationPending": False, "nameInbox": "EduHero WhatsApp",
  "mergeBrazilContacts": False, "importContacts": False, "importMessages": False, "daysLimitImportMessages": 3650,
  "autoCreate": False, "ignoreJids": []}))')
  evo evolution-eduhero POST /chatwoot/set/eduhero "$body" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); d.pop("token",None); print("chatwoot:", {k:d.get(k) for k in ("enabled","accountId","nameInbox","importMessages","webhook_url")})'
  echo "state: $(evo evolution-eduhero GET /instance/connectionState/eduhero)"
  ;;

route)
  test -d "$B" || { echo "run backup first"; exit 1; }
  ca_id=$(cut -d'|' -f1 "$B/inbox3-webhook.txt")
  cw_sql "update channel_api set webhook_url = '$NEW_WEBHOOK' where id = $ca_id returning id, webhook_url"
  sed -e '/^http:\/\/wa.eduhero.com.my:3200 {/,$ s#reverse_proxy evolution-api:8080#reverse_proxy evolution-eduhero:8080#' Caddyfile.public > Caddyfile.public.new
  echo "Caddy lines changed: $(diff Caddyfile.public Caddyfile.public.new | grep -c '^>')"
  docker compose exec -T public-gateway caddy validate --config /dev/stdin --adapter caddyfile < Caddyfile.public.new 2>&1 | tail -1
  cp -p Caddyfile.public "$B/Caddyfile.public.before-route"
  cat Caddyfile.public.new > Caddyfile.public
  docker compose exec -T public-gateway caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  docker compose exec -T public-gateway grep -c 'evolution-eduhero:8080' /etc/caddy/Caddyfile | sed 's/^/routes to evolution-eduhero: /'
  ;;

check)
  echo "Mirai mirai-test: $(evo evolution-api GET /instance/connectionState/mirai-test)"
  echo "Mirai evolution-api started: $(mirai_started) (before: $(cat "$B/mirai-evolution-startedat.txt"))"
  echo "EduHero (new): $(evo evolution-eduhero GET /instance/connectionState/eduhero)"
  echo "inbox 3: $(cw_sql "select webhook_url from channel_api where id = $(cut -d'|' -f1 "$B/inbox3-webhook.txt")")"
  docker compose ps evolution-eduhero evo-eduhero-postgres --format '{{.Name}} {{.Status}}'
  ;;

*)
  echo "usage: sh setup.sh backup | files | start | instance | route | check"; exit 2
  ;;
esac
