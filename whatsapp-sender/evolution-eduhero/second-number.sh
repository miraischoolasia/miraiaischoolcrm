#!/bin/sh
# EduHero's second WhatsApp number (2026-10-20): its own Chatwoot inbox "EduHero WhatsApp 2" and the Evolution
# instance eduhero-2 in the evolution-eduhero container (same patched Baileys as eduhero).
#
# The gateway's /wa routes then take the number from ?instance=: only the names on the list, anything else (or none)
# is eduhero, so a CRM that does not send it yet works exactly as before. The EduHero auto sender only picks chats of
# the two WhatsApp inboxes (WHATSAPP_INBOX_IDS).
#
# Touches nothing of Mirai (evolution-api, evo-postgres, account 1, Mirai's part of Caddyfile.public) and does not
# change inbox 3 or the eduhero instance. Makes no QR: eduhero-2 is created with qrcode false.
#
# Run on the server as root, one step at a time:
#   sh second-number.sh backup | inbox | instance | route | sender | check
# Undo: sh second-number.sh rollback   (the new inbox is kept; see the end of the output)
set -eu
cd /opt/mirai-inbox
B=backup-20261020-eduhero-2
OLD_B=backup-20261019-evo-eduhero
NAME="EduHero WhatsApp 2"
INSTANCE=eduhero-2

# Evolution (eduhero container) from inside it, with its own key: evo METHOD PATH [JSON]. The key is never printed.
evo() {
  docker compose exec -T evolution-eduhero node -e '
    const [method, path, body] = process.argv.slice(1)
    fetch("http://localhost:8080" + path, {
      method,
      headers: { apikey: process.env.AUTHENTICATION_API_KEY, "Content-Type": "application/json" },
      body: body || undefined,
    }).then(async (r) => { const t = await r.text(); console.log(t); if (!r.ok) process.exit(1) })
  ' "$1" "$2" "${3:-}"
}

# Chatwoot's API on the server (127.0.0.1:3000) with EduHero's token: cw METHOD PATH [JSON]
cw() {
  python3 - "$1" "$2" "${3:-}" <<'PY'
import json, sys, urllib.request
method, path, body = sys.argv[1], sys.argv[2], sys.argv[3]
token = json.load(open("/opt/mirai-inbox/backup-20261019-evo-eduhero/old-eduhero-chatwoot.json"))["token"]
request = urllib.request.Request("http://127.0.0.1:3000" + path, data=body.encode() if body else None, method=method,
                                 headers={"api_access_token": token, "Content-Type": "application/json"})
with urllib.request.urlopen(request, timeout=30) as response:
    print(response.read().decode())
PY
}

cw_sql() {
  docker compose exec -T cw-postgres psql -U postgres -d chatwoot -At -v ON_ERROR_STOP=1 -c "$1"
}

new_inbox() {
  cat "$B/new-inbox-id.txt"
}

case "${1:-}" in
backup)
  test ! -e "$B" || { echo "$B already exists; stopping"; exit 1; }
  test -s "$OLD_B/old-eduhero-chatwoot.json" || { echo "EduHero's Chatwoot settings are missing"; exit 1; }
  mkdir -m 700 "$B"
  cp -p Caddyfile.public docker-compose.yml auto-sender-eduhero.env auto_sender.py "$B/"
  cw_sql "select i.id, i.name, i.channel_type from inboxes i where i.account_id = 2 order by i.id" > "$B/inboxes-before.txt"
  cw_sql "select ca.webhook_url from inboxes i join channel_api ca on ca.id = i.channel_id where i.id = 3" > "$B/inbox3-webhook.txt"
  docker inspect "$(docker compose ps -q evolution-api)" --format '{{.State.StartedAt}}' > "$B/mirai-evolution-startedat.txt"
  evo GET /instance/fetchInstances | python3 -c 'import sys,json; [print(x["name"], x["connectionStatus"]) for x in json.load(sys.stdin)]' > "$B/eduhero-instances-before.txt"
  chmod 600 "$B"/*
  echo "inboxes:"; cat "$B/inboxes-before.txt"
  echo "inbox 3 webhook: $(cat "$B/inbox3-webhook.txt")"
  echo "evolution-eduhero: $(tr '\n' ' ' < "$B/eduhero-instances-before.txt")"
  echo "Mirai evolution-api started: $(cat "$B/mirai-evolution-startedat.txt")"
  ;;

inbox)
  test -d "$B" || { echo "run backup first"; exit 1; }
  test ! -e "$B/new-inbox-id.txt" || { echo "inbox already made: $(new_inbox)"; exit 1; }
  cw GET /api/v1/profile | python3 -c 'import sys,json; d=json.load(sys.stdin); print("token user:", d["id"], [(a["id"], a["role"]) for a in d.get("accounts", [])])'
  cw GET /api/v1/accounts/2/inboxes | python3 -c '
import sys, json
names = [i["name"] for i in json.load(sys.stdin)["payload"]]
assert "'"$NAME"'" not in names, "an inbox with this name exists already"'
  cw POST /api/v1/accounts/2/inboxes "{\"name\": \"$NAME\", \"channel\": {\"type\": \"api\", \"webhook_url\": \"http://evolution-eduhero:8080/chatwoot/webhook/$INSTANCE\"}}" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["id"])' > "$B/new-inbox-id.txt"
  id=$(new_inbox)
  echo "new inbox: $id"
  # The same people as inbox 3 (among them the gateway's own user, so the CRM sees its chats).
  members=$(cw GET /api/v1/accounts/2/inbox_members/3 | python3 -c 'import sys,json; print(json.dumps([u["id"] for u in json.load(sys.stdin)["payload"]]))')
  cw POST /api/v1/accounts/2/inbox_members "{\"inbox_id\": $id, \"user_ids\": $members}" > /dev/null
  echo "members (same as inbox 3): $members"
  cw_sql "select i.id, i.name, ca.webhook_url from inboxes i join channel_api ca on ca.id = i.channel_id where i.id = $id"
  ;;

instance)
  test -s "$B/new-inbox-id.txt" || { echo "run inbox first"; exit 1; }
  evo POST /instance/create "{\"instanceName\":\"$INSTANCE\",\"integration\":\"WHATSAPP-BAILEYS\",\"qrcode\":false,\"groupsIgnore\":false,\"syncFullHistory\":false,\"alwaysOnline\":false,\"readMessages\":false,\"readStatus\":false,\"rejectCall\":false}" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print("created:", d["instance"]["instanceName"], d["instance"]["status"])'
  body=$(python3 -c '
import json
old = json.load(open("'"$OLD_B"'/old-eduhero-chatwoot.json"))
print(json.dumps({"enabled": True, "accountId": "2", "token": old["token"], "url": "http://chatwoot-rails:3000",
  "signMsg": False, "reopenConversation": True, "conversationPending": False, "nameInbox": "'"$NAME"'",
  "mergeBrazilContacts": False, "importContacts": False, "importMessages": False, "daysLimitImportMessages": 3650,
  "autoCreate": False, "ignoreJids": []}))')
  evo POST "/chatwoot/set/$INSTANCE" "$body" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print("chatwoot:", {k: d.get(k) for k in ("enabled","accountId","nameInbox","importMessages","webhook_url")})'
  echo "state: $(evo GET "/instance/connectionState/$INSTANCE")"
  ;;

route)
  test -d "$B" || { echo "run backup first"; exit 1; }
  python3 - <<'PY'
import pathlib
p = pathlib.Path("Caddyfile.public")
text = p.read_text()
head, sep, block = text.partition("http://wa.eduhero.com.my:3200 {\n")
assert sep and "eh_instance" not in block
block = (
    "\t# Which WhatsApp number a /wa request is for (?instance=). Only the names below; anything else, or none,\n"
    "\t# is the first number, so a CRM that does not send it works as before.\n"
    "\tmap {query.instance} {eh_instance} {\n"
    "\t\teduhero-2 eduhero-2\n"
    "\t\tdefault eduhero\n"
    "\t}\n\n" + block
)
for old in ("/chat/markMessageAsRead/eduhero\n", "/{http.regexp.evo.1}/eduhero\n",
            "/instance/connectionState/eduhero\n", "/instance/connect/eduhero\n"):
    assert block.count(old) == 1, old
    block = block.replace(old, old.replace("/eduhero\n", "/{eh_instance}\n"))
pathlib.Path("Caddyfile.public.new").write_text(head + sep + block)
PY
  echo "Mirai part unchanged: $(sed -n '1,/^http:\/\/wa.eduhero.com.my:3200 {/p' Caddyfile.public | sha256sum | cut -c1-12) = $(sed -n '1,/^http:\/\/wa.eduhero.com.my:3200 {/p' Caddyfile.public.new | sha256sum | cut -c1-12)"
  echo "lines changed: $(diff Caddyfile.public Caddyfile.public.new | grep -c '^>')"
  docker compose exec -T public-gateway caddy validate --config /dev/stdin --adapter caddyfile < Caddyfile.public.new 2>&1 | grep -E "Valid configuration|Error" || { echo "not valid; stopping"; exit 1; }
  cat Caddyfile.public.new > Caddyfile.public
  docker compose exec -T public-gateway caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  docker compose exec -T public-gateway caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile 2>/dev/null \
    | python3 -c '
import sys, json
text = sys.stdin.read()
print("map default eduhero:", "\"defaults\":[\"eduhero\"]" in text, "| eduhero-2 listed:", "\"eduhero-2\"" in text,
      "| routes with {eh_instance}:", text.count("{eh_instance}"))'
  ;;

sender)
  test -s "$B/new-inbox-id.txt" || { echo "run inbox first"; exit 1; }
  test -s evolution-eduhero/auto_sender.py.new || { echo "copy the new auto_sender.py to evolution-eduhero/auto_sender.py.new first"; exit 1; }
  python3 -m py_compile evolution-eduhero/auto_sender.py.new
  grep -q '^WHATSAPP_INBOX_IDS=' auto-sender-eduhero.env && { echo "WHATSAPP_INBOX_IDS already set; stopping"; exit 1; }
  echo "WHATSAPP_INBOX_IDS=3,$(new_inbox)" >> auto-sender-eduhero.env
  cp evolution-eduhero/auto_sender.py.new auto_sender.py
  # Only EduHero's sender restarts; Mirai's keeps running (its env has no WHATSAPP_INBOX_IDS, so nothing changes for it).
  systemctl restart eduhero-auto-sender
  sleep 5
  systemctl is-active eduhero-auto-sender mirai-auto-sender
  journalctl -u eduhero-auto-sender -n 3 --no-pager | cut -c1-160
  ;;

check)
  echo "Mirai mirai-test: $(docker compose exec -T public-gateway sh -c 'wget -qO- --header "apikey: $AUTHENTICATION_API_KEY" http://evolution-api:8080/instance/connectionState/mirai-test')"
  echo "Mirai evolution-api started: $(docker inspect "$(docker compose ps -q evolution-api)" --format '{{.State.StartedAt}}') (before: $(cat "$B/mirai-evolution-startedat.txt"))"
  echo "eduhero: $(evo GET /instance/connectionState/eduhero)"
  echo "eduhero-2: $(evo GET "/instance/connectionState/$INSTANCE")"
  echo "inbox 3 webhook: $(cw_sql "select ca.webhook_url from inboxes i join channel_api ca on ca.id = i.channel_id where i.id = 3") (before: $(cat "$B/inbox3-webhook.txt"))"
  [ -s "$B/new-inbox-id.txt" ] && echo "new inbox: $(cw_sql "select i.id || ' ' || i.name || ' ' || ca.webhook_url from inboxes i join channel_api ca on ca.id = i.channel_id where i.id = $(new_inbox)")"
  systemctl is-active mirai-auto-sender eduhero-auto-sender | tr '\n' ' '; echo
  ;;

rollback)
  test -d "$B" || { echo "no backup folder $B"; exit 1; }
  cat "$B/Caddyfile.public" > Caddyfile.public
  docker compose exec -T public-gateway caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  echo "gateway back"
  if ! cmp -s "$B/auto-sender-eduhero.env" auto-sender-eduhero.env || ! cmp -s "$B/auto_sender.py" auto_sender.py; then
    cp -p "$B/auto-sender-eduhero.env" auto-sender-eduhero.env
    cp -p "$B/auto_sender.py" auto_sender.py
    systemctl restart eduhero-auto-sender
    echo "EduHero sender back"
  fi
  evo DELETE "/instance/delete/$INSTANCE" >/dev/null 2>&1 && echo "eduhero-2 removed" || echo "eduhero-2 was not there"
  [ -s "$B/new-inbox-id.txt" ] && echo "The Chatwoot inbox $(new_inbox) ($NAME) is kept (it may hold chats). Delete it in Chatwoot only if it is empty and not wanted."
  ;;

*)
  echo "usage: sh second-number.sh backup | inbox | instance | route | sender | check | rollback"; exit 2
  ;;
esac
