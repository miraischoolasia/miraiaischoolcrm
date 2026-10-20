#!/bin/sh
# Sets up wa-watch (whatsapp-sender/wa_watch.py): every WhatsApp number watched every 30 seconds, a phone
# notification (ntfy) and a GitHub issue when one stops working, its state written to the schools' CRM databases.
# It only reads Evolution and Chatwoot; it never links, logs out or sends to parents. No gateway change.
#
# Run on the server as root, from /opt/mirai-inbox, one step at a time (new files first copied to wa-watch/):
#   sh wa-watch/setup.sh backup    copies of docker-compose.yml
#   sh wa-watch/setup.sh config    wa-watch.json (600) from the keys already on this server; makes the two reporter
#                                  keys (wa-watch-keys.json, 600) and the SQL that puts them in the CRM databases
#                                  (wa-watch/set-reporter-key-<school>.sql, for the release team; then deleted)
#   sh wa-watch/setup.sh start     adds the wa-watch service and starts it (nothing else restarts)
#   sh wa-watch/setup.sh reports   once both SQL files ran: the reporter keys go into wa-watch.json, wa-watch restarts
#   sh wa-watch/setup.sh alerts <phones> the phones the WhatsApp notes go to (60...,60...), ntfy off
#   sh wa-watch/setup.sh token     the GitHub token (Issues: write) from /root/.config/mirai-backup/github-token
#   sh wa-watch/setup.sh check     what it sees
#   sh wa-watch/setup.sh rollback  stops and removes wa-watch, compose back
set -eu
cd /opt/mirai-inbox
B=backup-20261020-wa-watch

case "${1:-}" in
backup)
  test ! -e "$B" || { echo "$B already exists; stopping"; exit 1; }
  mkdir -m 700 "$B"
  cp -p docker-compose.yml "$B/"
  ls -la "$B"
  ;;

config)
  test ! -e wa-watch.json || { echo "wa-watch.json exists already; stopping"; exit 1; }
  test -s wa-watch/wa_watch.py || { echo "copy wa_watch.py to wa-watch/ first"; exit 1; }
  python3 -m py_compile wa-watch/wa_watch.py
  umask 077
  python3 - <<'PY'
import json, os, secrets
def env(path):
    values = {}
    for line in open(path):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            key, value = line.split("=", 1)
            values[key] = value.strip().strip('"')
    return values
evo = env("evolution.env")
evo_edu = env("evolution-eduhero.env")
gw = env("gateway-auth.env")
gw_edu = env("gateway-auth-eduhero.env")
namer = env("contact-namer.env")
health = env("health.env") if os.path.exists("health.env") else {}
edu_token = json.load(open("backup-20261019-evo-eduhero/old-eduhero-chatwoot.json"))["token"]
github = ""
if os.path.exists("/root/.config/mirai-backup/github-token"):
    github = open("/root/.config/mirai-backup/github-token").read().strip()
config = {
    "chatwoot_url": "http://chatwoot-rails:3000",
    "evolutions": [{"url": "http://evolution-api:8080", "key": evo["AUTHENTICATION_API_KEY"]},
                   {"url": "http://evolution-eduhero:8080", "key": evo_edu["AUTHENTICATION_API_KEY"]}],
    "schools": [
        {"name": "Mirai", "account": 1, "chatwoot_token": namer["CHATWOOT_TOKEN"], "supabase_url": gw["SUPABASE_URL"],
         "supabase_key": gw["SUPABASE_PUBLISHABLE_KEY"], "reporter_key": "", "crm_url": "https://crm.miraischool.asia"},
        {"name": "EduHero", "account": 2, "chatwoot_token": edu_token, "supabase_url": gw_edu["SUPABASE_URL"],
         "supabase_key": gw_edu["SUPABASE_PUBLISHABLE_KEY"], "reporter_key": "", "crm_url": "https://crm2.eduhero.com.my"},
    ],
    "ntfy_topic": health.get("NTFY_TOPIC", ""),
    "github_token": github,
    "github_repo": "miraischoolasia/miraiaischoolcrm",
}
json.dump(config, open("wa-watch.json", "w"), indent=1)
keys = {"Mirai": secrets.token_hex(32), "EduHero": secrets.token_hex(32)}
json.dump(keys, open("wa-watch-keys.json", "w"))
for school, key in keys.items():
    with open(f"wa-watch/set-reporter-key-{school.lower()}.sql", "w") as out:
        out.write(f"-- Run on the {school} CRM database AFTER migration 20261027950000. Then delete this file.\n"
                  f"update public.whatsapp_status_reporter set reporter_key = '{key}' where id;\n"
                  f"select count(*) as keys_set from public.whatsapp_status_reporter where reporter_key = '{key}';\n")
print("wa-watch.json:", len(config["evolutions"]), "Evolution servers,", len(config["schools"]), "schools; ntfy",
      "yes" if config["ntfy_topic"] else "no", "| GitHub", "yes" if github else "not yet")
PY
  chmod 600 wa-watch.json wa-watch-keys.json wa-watch/set-reporter-key-*.sql
  ls -la wa-watch.json wa-watch-keys.json wa-watch/
  ;;

start)
  test -d "$B" || { echo "run backup first"; exit 1; }
  test -s wa-watch.json || { echo "run config first"; exit 1; }
  cp wa-watch/wa_watch.py wa_watch.py
  python3 - <<'PY'
import pathlib
p = pathlib.Path("docker-compose.yml")
text = p.read_text()
assert "  wa-watch:" not in text
service = """  # Watches every WhatsApp number every 30 seconds and tells at once (phone + GitHub + the CRM's bar) when one stops
  # working. Only reads Evolution and Chatwoot. Set up by whatsapp-sender/wa-watch/setup.sh in the CRM repo.
  wa-watch:
    image: python@sha256:1b668429b3511ab407d8e00648891631b0b1a4d7e15e3ca70f38ab5b91ad4ab4
    volumes:
      - ./wa_watch.py:/app/wa_watch.py:ro
      - ./wa-watch.json:/app/wa-watch.json:ro
    command: ["python", "-u", "/app/wa_watch.py"]
    restart: unless-stopped

"""
marker = "\nvolumes:\n"
assert text.count(marker) == 1
p.write_text(text.replace(marker, "\n" + service + "volumes:\n", 1))
PY
  docker compose config -q
  docker compose up -d --no-deps wa-watch
  sleep 40
  docker compose logs --no-color --tail 10 wa-watch
  ;;

reports)
  test -s wa-watch-keys.json || { echo "no wa-watch-keys.json"; exit 1; }
  python3 - <<'PY'
import json
config = json.load(open("wa-watch.json"))
keys = json.load(open("wa-watch-keys.json"))
for school in config["schools"]:
    school["reporter_key"] = keys[school["name"]]
json.dump(config, open("wa-watch.json", "w"), indent=1)
print("reporter keys in for:", [s["name"] for s in config["schools"]])
PY
  rm -f wa-watch/set-reporter-key-*.sql
  docker compose restart wa-watch
  sleep 40
  docker compose logs --no-color --tail 10 wa-watch
  ;;

alerts)
  # The phones the WhatsApp notes go to, given on the command line (never in the repo):
  #   sh wa-watch/setup.sh alerts 60123456789,60198765432
  phones="${2:-}"
  echo "$phones" | grep -Eq '^[0-9]{10,15}(,[0-9]{10,15})*$' || { echo "give the phones as 60123456789,60198765432"; exit 1; }
  test -s wa-watch/wa_watch.py && cp wa-watch/wa_watch.py wa_watch.py
  PHONES="$phones" python3 - <<'PY'
import json, os
config = json.load(open("wa-watch.json"))
config["alert_phones"] = os.environ["PHONES"].split(",")
config.pop("ntfy_topic", None)   # the owner chose WhatsApp notes, not ntfy (2026-10-20)
json.dump(config, open("wa-watch.json", "w"), indent=1)
print("alert phones:", len(config["alert_phones"]), "| ntfy: off")
PY
  docker compose restart wa-watch
  sleep 40
  docker compose logs --no-color --tail 5 wa-watch
  ;;

token)
  test -s /root/.config/mirai-backup/github-token || { echo "no GitHub token yet"; exit 1; }
  python3 - <<'PY'
import json
config = json.load(open("wa-watch.json"))
config["github_token"] = open("/root/.config/mirai-backup/github-token").read().strip()
json.dump(config, open("wa-watch.json", "w"), indent=1)
print("GitHub token in")
PY
  docker compose restart wa-watch
  ;;

check)
  docker compose ps wa-watch --format '{{.Name}} {{.Status}}'
  docker compose logs --no-color --since 30m wa-watch | tail -15
  ;;

rollback)
  docker compose stop wa-watch 2>/dev/null || true
  docker compose rm -f wa-watch 2>/dev/null || true
  cp -p "$B/docker-compose.yml" docker-compose.yml
  docker compose config -q && echo "wa-watch removed; compose back (wa-watch.json and the keys stay, 600)"
  ;;

*)
  echo "usage: sh wa-watch/setup.sh backup | config | start | reports | alerts <phones> | token | check | rollback"; exit 2
  ;;
esac
