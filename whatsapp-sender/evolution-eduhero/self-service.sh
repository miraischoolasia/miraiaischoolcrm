#!/bin/sh
# EduHero's admins add and switch off WhatsApp numbers from the CRM (2026-10-20).
#
#  - wa_numbers.py runs as wa-numbers-eduhero behind the gateway's admin check (/wa/numbers...).
#  - gateway_auth.py checks ?instance= against the CRM's whatsapp_numbers (switched on, given to this person).
#  - Caddy's EduHero part takes any eduhero-<number> by rule, so a new number needs no Caddy change.
#  - EduHero's auto sender finds every WhatsApp inbox itself (WHATSAPP_INBOX_IDS=auto).
#
# Touches nothing of Mirai: its evolution-api, account 1, Caddy part and sender stay; Mirai's gateway-auth container
# is not restarted (it shares gateway_auth.py, whose new check only acts on ?instance=, which Mirai does not send).
# Does not change the eduhero / eduhero-2 numbers or inboxes 3 and 6, and adds no number.
#
# Run on the server as root, one step at a time (the new files first copied to evolution-eduhero/):
#   sh self-service.sh backup | files | gateway | caddy | service | sender | check
#   sh self-service.sh rollback
#   sh self-service.sh remove eduhero-<n>   (deletes a number for good: only with the owner's OK, after switching it off)
set -eu
cd /opt/mirai-inbox
B=backup-20261020-self-service
NEW=evolution-eduhero

evo() {  # Evolution of EduHero, from inside its container: evo METHOD PATH
  docker compose exec -T evolution-eduhero node -e '
    const [method, path] = process.argv.slice(1)
    fetch("http://localhost:8080" + path, { method, headers: { apikey: process.env.AUTHENTICATION_API_KEY } })
      .then(async (r) => { console.log(await r.text()); if (!r.ok) process.exit(1) })
  ' "$1" "$2"
}

started() {
  docker inspect "$(docker compose ps -q "$1")" --format '{{.State.StartedAt}}'
}

same_config() {  # the services other than the new one are configured exactly as before
  for s in evolution-api evo-postgres public-gateway gateway-auth gateway-auth-eduhero evolution-eduhero chatwoot-rails; do
    a=$(docker compose --project-directory . -f "$B/docker-compose.yml" config "$s" 2>&1 | md5sum)
    b=$(docker compose config "$s" 2>&1 | md5sum)
    [ "$a" = "$b" ] || { echo "CHANGED: $s"; return 1; }
  done
  echo "other services unchanged"
}

case "${1:-}" in
backup)
  test ! -e "$B" || { echo "$B already exists; stopping"; exit 1; }
  mkdir -m 700 "$B"
  cp -p Caddyfile.public docker-compose.yml gateway_auth.py auto_sender.py auto-sender-eduhero.env "$B/"
  for s in evolution-api gateway-auth gateway-auth-eduhero; do echo "$s $(started "$s")"; done > "$B/started.txt"
  systemctl show -p MainPID --value mirai-auto-sender > "$B/mirai-sender-pid.txt"
  chmod 600 "$B"/*
  cat "$B/started.txt"; echo "mirai-auto-sender pid $(cat "$B/mirai-sender-pid.txt")"
  ;;

files)
  test -d "$B" || { echo "run backup first"; exit 1; }
  for f in gateway_auth.py.new auto_sender.py.new wa_numbers.py; do
    test -s "$NEW/$f" || { echo "missing $NEW/$f"; exit 1; }
    python3 -m py_compile "$NEW/$f"
  done
  test ! -e wa-numbers-eduhero.env || { echo "wa-numbers-eduhero.env already exists; stopping"; exit 1; }
  umask 077
  {
    echo "EVOLUTION_URL=http://evolution-eduhero:8080"
    grep '^AUTHENTICATION_API_KEY=' evolution-eduhero.env | sed 's/^AUTHENTICATION_API_KEY=/EVOLUTION_KEY=/'
    echo "CHATWOOT_URL=http://chatwoot-rails:3000"
    echo "CHATWOOT_ACCOUNT=2"
    python3 -c 'import json; print("CHATWOOT_TOKEN=" + json.load(open("backup-20261019-evo-eduhero/old-eduhero-chatwoot.json"))["token"])'
    grep -E '^(SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY)=' gateway-auth-eduhero.env
    echo "INSTANCE_PREFIX=eduhero"
    echo "MAX_NUMBERS=10"
    echo "MAX_PER_DAY=5"
  } > wa-numbers-eduhero.env
  umask 022
  test "$(grep -c '=' wa-numbers-eduhero.env)" -eq 10 || { echo "wa-numbers-eduhero.env is incomplete"; exit 1; }
  cp "$NEW/wa_numbers.py" wa_numbers.py
  python3 - <<'PY'
import pathlib
p = pathlib.Path("docker-compose.yml")
text = p.read_text()
assert "wa-numbers-eduhero:" not in text
service = """  # EduHero's admins add and switch off WhatsApp numbers from the CRM (wa_numbers.py), behind the gateway's
  # admin check (/wa/numbers). Set up by whatsapp-sender/evolution-eduhero/self-service.sh in the CRM repo.
  wa-numbers-eduhero:
    image: python@sha256:1b668429b3511ab407d8e00648891631b0b1a4d7e15e3ca70f38ab5b91ad4ab4
    env_file: wa-numbers-eduhero.env
    volumes:
      - ./wa_numbers.py:/app/wa_numbers.py:ro
    command: ["python", "-u", "/app/wa_numbers.py"]
    restart: unless-stopped

"""
marker = "\nvolumes:\n"
assert text.count(marker) == 1
p.write_text(text.replace(marker, "\n" + service + "volumes:\n", 1))
PY
  docker compose config -q && echo "compose OK"
  same_config
  ;;

gateway)
  test -s "$NEW/gateway_auth.py.new" || { echo "missing the new gateway_auth.py"; exit 1; }
  # Same file, new content (a bind mount of one file follows the file, not its name).
  cat "$NEW/gateway_auth.py.new" > gateway_auth.py
  # Only EduHero's checker restarts (a few seconds); Mirai's keeps running and gets the same code on its next start.
  docker compose restart gateway-auth-eduhero
  i=0; until docker compose exec -T public-gateway wget -qO- http://gateway-auth-eduhero:9000/health >/dev/null 2>&1; do i=$((i+1)); [ $i -lt 20 ] || { echo "gateway-auth-eduhero does not answer"; exit 1; }; sleep 1; done
  echo "gateway-auth-eduhero answers; Mirai's gateway-auth started $(started gateway-auth) (before: $(grep '^gateway-auth ' "$B/started.txt" | cut -d' ' -f2))"
  ;;

caddy)
  python3 - <<'PY'
import pathlib
p = pathlib.Path("Caddyfile.public")
text = p.read_text()
head, sep, block = text.partition("http://wa.eduhero.com.my:3200 {\n")
assert sep and "@wa_numbers" not in block
old_map = "\t\teduhero-2 eduhero-2\n"
assert block.count(old_map) == 1
block = block.replace(old_map, "\t\t~^(eduhero-[0-9]+)$ ${1}\n")
route = """\t# Adding, listing and switching off the school's WhatsApp numbers: admins only. The login token goes on, so
\t# the number is written to the CRM database as that admin.
\t@wa_numbers path /wa/numbers /wa/numbers/*
\thandle @wa_numbers {
\t\theader Access-Control-Allow-Origin "{eduhero_origin}"
\t\theader Vary Origin
\t\tforward_auth gateway-auth-eduhero:9000 {
\t\t\turi /verify-admin
\t\t}
\t\treverse_proxy wa-numbers-eduhero:9200
\t}

"""
anchor = "\t@api path "
assert block.count(anchor) == 1
block = block.replace(anchor, route + anchor, 1)
pathlib.Path("Caddyfile.public.new").write_text(head + sep + block)
PY
  echo "Mirai part unchanged: $(sed -n '1,/^http:\/\/wa.eduhero.com.my:3200 {/p' Caddyfile.public | sha256sum | cut -c1-12) = $(sed -n '1,/^http:\/\/wa.eduhero.com.my:3200 {/p' Caddyfile.public.new | sha256sum | cut -c1-12)"
  docker compose exec -T public-gateway caddy validate --config /dev/stdin --adapter caddyfile < Caddyfile.public.new 2>&1 | grep -E "Valid configuration|Error" || { echo "not valid; stopping"; exit 1; }
  cat Caddyfile.public.new > Caddyfile.public
  docker compose exec -T public-gateway caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  docker compose exec -T public-gateway grep -c -E 'wa-numbers-eduhero:9200|eduhero-\[0-9\]' /etc/caddy/Caddyfile | sed 's/^/new lines live: /'
  ;;

service)
  docker compose up -d --no-deps wa-numbers-eduhero
  i=0; until docker compose exec -T public-gateway wget -qO- http://wa-numbers-eduhero:9200/health 2>/dev/null | grep -q ok; do i=$((i+1)); [ $i -lt 20 ] || { docker compose logs --tail 20 wa-numbers-eduhero; exit 1; }; sleep 1; done
  echo "wa-numbers-eduhero answers"
  # Reads only: does it reach Evolution and Chatwoot with its keys?
  docker compose exec -T wa-numbers-eduhero python -c '
import sys; sys.path.insert(0, "/app"); import wa_numbers as w
print("numbers:", [(i["name"], i["state"]) for i in w.instances()], "| inboxes:", w.inboxes()[0])'
  ;;

sender)
  test -s "$NEW/auto_sender.py.new" || { echo "missing the new auto_sender.py"; exit 1; }
  grep -q '^WHATSAPP_INBOX_IDS=' auto-sender-eduhero.env || { echo "WHATSAPP_INBOX_IDS not found"; exit 1; }
  sed -i 's/^WHATSAPP_INBOX_IDS=.*/WHATSAPP_INBOX_IDS=auto/' auto-sender-eduhero.env
  cp "$NEW/auto_sender.py.new" auto_sender.py
  systemctl restart eduhero-auto-sender
  sleep 5
  echo "eduhero sender: $(systemctl is-active eduhero-auto-sender) | mirai sender pid $(systemctl show -p MainPID --value mirai-auto-sender) (before: $(cat "$B/mirai-sender-pid.txt"))"
  journalctl -u eduhero-auto-sender -n 2 --no-pager | cut -c1-150
  ;;

check)
  echo "Mirai mirai-test: $(docker compose exec -T public-gateway sh -c 'wget -qO- --header "apikey: $AUTHENTICATION_API_KEY" http://evolution-api:8080/instance/connectionState/mirai-test')"
  for s in evolution-api gateway-auth; do echo "$s started $(started "$s") (before: $(grep "^$s " "$B/started.txt" | cut -d' ' -f2))"; done
  echo "mirai sender pid $(systemctl show -p MainPID --value mirai-auto-sender) (before: $(cat "$B/mirai-sender-pid.txt"))"
  echo "EduHero numbers: $(evo GET /instance/fetchInstances | python3 -c 'import sys,json; print([(x["name"], x["connectionStatus"]) for x in json.load(sys.stdin)])')"
  docker compose exec -T cw-postgres psql -U postgres -d chatwoot -At -F ' | ' -c "select i.id, i.name, ca.webhook_url from inboxes i join channel_api ca on ca.id = i.channel_id where i.id in (3, 6) order by i.id"
  docker compose ps gateway-auth-eduhero wa-numbers-eduhero public-gateway --format '{{.Name}} {{.Status}}'
  systemctl is-active mirai-auto-sender eduhero-auto-sender | tr '\n' ' '; echo
  ;;

rollback)
  test -d "$B" || { echo "no backup folder $B"; exit 1; }
  cat "$B/Caddyfile.public" > Caddyfile.public
  docker compose exec -T public-gateway caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile && echo "gateway routes back"
  if ! cmp -s "$B/gateway_auth.py" gateway_auth.py; then
    cat "$B/gateway_auth.py" > gateway_auth.py
    docker compose restart gateway-auth-eduhero && echo "EduHero login check back"
  fi
  if ! cmp -s "$B/auto_sender.py" auto_sender.py || ! cmp -s "$B/auto-sender-eduhero.env" auto-sender-eduhero.env; then
    cp -p "$B/auto_sender.py" auto_sender.py
    cp -p "$B/auto-sender-eduhero.env" auto-sender-eduhero.env
    systemctl restart eduhero-auto-sender && echo "EduHero sender back"
  fi
  if docker compose ps -q wa-numbers-eduhero 2>/dev/null | grep -q .; then
    docker compose stop wa-numbers-eduhero && docker compose rm -f wa-numbers-eduhero
  fi
  cp -p "$B/docker-compose.yml" docker-compose.yml
  [ -f wa-numbers-eduhero.env ] && mv wa-numbers-eduhero.env "$B/wa-numbers-eduhero.env.removed"
  docker compose config -q && echo "compose back"
  echo "Numbers added from the CRM in the meantime stay (their inboxes and Evolution numbers); they keep working with the old gateway only as the first number's routes."
  ;;

remove)
  name="${2:-}"
  echo "$name" | grep -Eq '^eduhero-[0-9]{1,3}$' || { echo "give a number like eduhero-3 (the first number cannot be removed here)"; exit 1; }
  evo DELETE "/instance/logout/$name" >/dev/null 2>&1 || true
  evo DELETE "/instance/delete/$name" >/dev/null && echo "$name removed from Evolution"
  echo "Its Chatwoot inbox and chats are kept. Switch it off in the CRM (Numbers) if not done yet, so the gateway refuses it."
  ;;

*)
  echo "usage: sh self-service.sh backup | files | gateway | caddy | service | sender | check | rollback | remove eduhero-<n>"; exit 2
  ;;
esac
