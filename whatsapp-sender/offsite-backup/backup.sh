#!/bin/sh
# Daily backup of the WhatsApp inbox server, run by /etc/cron.d/mirai-backup at 03:30 MYT.
#
# On this server, /opt/backups/<day> (newest 7 days; the media files as one tar on Sundays, newest 3):
#   chatwoot.dump, evolution.dump (Mirai), evolution-eduhero.dump (EduHero), n8n.tar.gz + n8n.env,
#   evolution-instances.tar.gz, evolution-eduhero-instances.tar.gz, and config.tar.gz (compose, Caddy, the
#   programs and every .env, i.e. the keys: it leaves this server only inside the encrypted remote).
# Off site, encrypted by rclone crypt ("gcrypt:", inside the owner's Google Drive "gdrive:", scope drive.file):
#   daily/<day>/   everything above but the Sunday media tar; newest 14 days
#   media/         Chatwoot's files, only the new ones each night; a file gone here moves to media-old/<day>/ (30 days)
# Until the Drive is connected the off-site part is skipped (status "offsite": "not set up") and is no failure.
#
# Then it writes backup-status/status.json (times, sizes, what failed; no secrets), which the gateway serves at
# https://wa.miraischool.asia/backup-status for the GitHub "Inbox server watch", and when something failed it opens
# one GitHub issue (label "backup") if a token is in /root/.config/mirai-backup/github-token.
# Source: whatsapp-sender/offsite-backup/backup.sh in the CRM repo.
set -u
cd /opt/mirai-inbox
DEST=/opt/backups
DAY=$(date +%Y-%m-%d)
STATUS_DIR=/opt/mirai-inbox/backup-status
TOKEN_FILE=/root/.config/mirai-backup/github-token
REPO=miraischoolasia/miraiaischoolcrm
REMOTE=gcrypt:
KEEP_LOCAL_DAYS=7
KEEP_REMOTE_DAYS=14
KEEP_MEDIA_OLD_DAYS=30
MEDIA=$(docker volume inspect -f '{{.Mountpoint}}' whatsapp-inbox-test_cw_storage 2>/dev/null)
STARTED=$(date +%s)
failed=""

fail() {
  failed="$failed $1"
  echo "$(date -Iseconds) FAILED: $1"
}

mkdir -p "$DEST/$DAY" "$STATUS_DIR"
chmod 700 "$DEST"

# A database copy, taken while it runs (pg_dump does not stop or lock the inbox).
dump() {  # dump <service> <database> <file>
  if docker compose exec -T "$1" pg_dump -U postgres -Fc "$2" > "$DEST/$DAY/$3.tmp" && [ -s "$DEST/$DAY/$3.tmp" ]; then
    mv "$DEST/$DAY/$3.tmp" "$DEST/$DAY/$3"
  else
    rm -f "$DEST/$DAY/$3.tmp"
    fail "$3"
  fi
}

# A folder inside a container, as a .tar.gz (an empty or missing result counts as failed).
pack() {  # pack <service> <folder> <file>
  docker compose exec -T "$1" tar cf - -C "$2" . | gzip > "$DEST/$DAY/$3"
  [ "$(wc -c < "$DEST/$DAY/$3")" -gt 100 ] || fail "$3"
}

dump cw-postgres chatwoot chatwoot.dump
dump evo-postgres evolution evolution.dump
dump evo-eduhero-postgres evolution evolution-eduhero.dump
pack n8n /home/node/.n8n n8n.tar.gz
cp n8n.env "$DEST/$DAY/n8n.env" || fail n8n.env
pack evolution-api /evolution/instances evolution-instances.tar.gz
pack evolution-eduhero /evolution/instances evolution-eduhero-instances.tar.gz
# shellcheck disable=SC2046
tar czf "$DEST/$DAY/config.tar.gz" --exclude=__pycache__ \
  $(ls -d docker-compose.yml Caddyfile* *.env *.py *.sh *.json image-digests.txt patches evolution-eduhero 2>/dev/null) \
  || fail config.tar.gz
if [ "$(date +%u)" = "7" ]; then
  docker compose exec -T chatwoot-rails tar cf - -C /app/storage . | gzip > "$DEST/$DAY/media.tar.gz" || fail media.tar.gz
fi
chmod -R go-rwx "$DEST"
SIZE=$(du -sh "$DEST/$DAY" | cut -f1)

# This server keeps a week (only the dated folders; manual copies stay) and the newest 3 media tars.
find "$DEST" -mindepth 1 -maxdepth 1 -type d -name '20??-??-??' -mtime +"$KEEP_LOCAL_DAYS" -exec rm -rf {} +
ls -1t "$DEST"/*/media.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm -f

# Off site.
OFFSITE="not set up"
DRIVE_PCT=""
R="nice -n 19 ionice -c3 rclone --bwlimit 4M --transfers 2 --checkers 4 --retries 3 --low-level-retries 10"

day_number() {
  echo "$1" | tr -d '-'
}

# Removes the dated folders (YYYY-MM-DD) of a remote folder older than <days>.
prune() {  # prune <remote folder> <days>
  cutoff=$(day_number "$(date -d "-$2 days" +%Y-%m-%d)")
  for folder in $(rclone lsf --dirs-only "$1" 2>/dev/null | tr -d '/'); do
    case "$folder" in
      20[0-9][0-9]-[0-9][0-9]-[0-9][0-9])
        if [ "$(day_number "$folder")" -lt "$cutoff" ]; then
          $R purge "$1/$folder" || fail "tidy $folder"
        fi
        ;;
    esac
  done
}

if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -qx gdrive: && rclone listremotes | grep -qx gcrypt:; then
  OFFSITE="ok"
  $R copy "$DEST/$DAY" "${REMOTE}daily/$DAY" --exclude media.tar.gz || { OFFSITE="failed"; fail upload-daily; }
  if [ -n "$MEDIA" ] && [ -d "$MEDIA" ]; then
    $R sync "$MEDIA" "${REMOTE}media" --backup-dir "${REMOTE}media-old/$DAY" || { OFFSITE="failed"; fail upload-media; }
  else
    OFFSITE="failed"
    fail media-volume
  fi
  prune "${REMOTE}daily" "$KEEP_REMOTE_DAYS"
  prune "${REMOTE}media-old" "$KEEP_MEDIA_OLD_DAYS"
  DRIVE_PCT=$(rclone about gdrive: --json 2>/dev/null | python3 -c 'import sys, json
d = json.load(sys.stdin)
print(round(100 * d["used"] / d["total"]) if d.get("total") else "")' 2>/dev/null)
fi

# The status the gateway shows (no secrets: times, sizes and the names of failed parts).
FINISHED=$(date +%s)
python3 - "$STATUS_DIR/status.json" "$failed" "$SIZE" "$OFFSITE" "$DRIVE_PCT" "$((FINISHED - STARTED))" <<'PY'
import datetime, json, os, sys
path, failed, size, offsite, drive_pct, seconds = sys.argv[1:]
try:
    previous = json.load(open(path))
except Exception:
    previous = {}
now = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
failed = failed.split()
status = {
    "last_run": now,
    "ok": not failed,
    "failed": failed,
    "last_ok": now if not failed else previous.get("last_ok"),
    "size": size,
    "offsite": offsite,
    "drive_used_percent": int(drive_pct) if drive_pct.isdigit() else None,
    "seconds": int(seconds),
}
tmp = path + ".tmp"
with open(tmp, "w") as out:
    json.dump(status, out, indent=1)
os.chmod(tmp, 0o644)
os.replace(tmp, path)
PY

# One GitHub issue when something failed (the "Inbox server watch" closes it once a backup is fine again).
if [ -n "$failed" ] && [ -s "$TOKEN_FILE" ]; then
  python3 - "$TOKEN_FILE" "$REPO" "$DAY" "$failed" <<'PY' || echo "$(date -Iseconds) could not open the GitHub issue"
import json, sys, urllib.request
token_file, repo, day, failed = sys.argv[1:]
token = open(token_file).read().strip()
def call(method, path, body=None):
    request = urllib.request.Request("https://api.github.com/repos/" + repo + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json", "User-Agent": "mirai-backup"})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read() or b"null")
if not call("GET", "/issues?state=open&labels=backup"):
    body = {"title": "Backup failed on " + day + ":" + failed, "labels": ["backup"],
            "body": "Last night's backup of the inbox server did not finish: " + failed.strip() + ".\n\n"
                    "The log is /var/log/mirai-backup.log on the server. This issue closes itself when a backup is fine again."}
    try:
        call("POST", "/issues", body)
    except Exception:
        body.pop("labels")
        call("POST", "/issues", body)
PY
fi

echo "$(date -Iseconds) backup $( [ -z "$failed" ] && echo ok || echo "FAILED:$failed"): $SIZE, offsite $OFFSITE${DRIVE_PCT:+, Drive ${DRIVE_PCT}% used}, $((FINISHED - STARTED)) s"
[ -z "$failed" ]
