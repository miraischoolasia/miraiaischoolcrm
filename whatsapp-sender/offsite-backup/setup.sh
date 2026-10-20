#!/bin/sh
# Sets up the encrypted off-site backup to the owner's Google Drive (2026-10-20). Run on the server as root, one step
# at a time, from /opt/mirai-inbox (the new files first copied to /opt/mirai-inbox/offsite-backup/):
#
#   sh setup.sh backup    copies of backup.sh, its cron line, compose and Caddyfile.public
#   sh setup.sh install   rclone from Ubuntu's own (signed) packages
#   sh setup.sh crypt     the encryption remote "gcrypt:" and its two random passwords
#                         (/root/.config/mirai-backup/passwords.txt; the owner keeps a copy)
#   sh setup.sh script    the new backup.sh (same place, same 03:30 cron line)
#   sh setup.sh run       one backup now, to see it work
#   sh setup.sh gateway   https://wa.miraischool.asia/backup-status for the GitHub watch: recreates public-gateway,
#                         both inboxes are away for about 5 seconds (after 22:00)
#   sh setup.sh token     moves a GitHub token from offsite-backup/github-token into place (it is never printed)
#   sh setup.sh check     what is set up
#   sh setup.sh rollback  the old backup.sh, cron, compose and Caddyfile back (rclone and the Drive copies stay)
#
# The Drive itself ("gdrive:") is connected by the owner with connect-drive.cmd on his own PC: Google's answer
# goes from there straight into this server's rclone settings over ssh.
set -eu
cd /opt/mirai-inbox
B=backup-20261020-offsite
NEW=offsite-backup
CONF_DIR=/root/.config/mirai-backup

case "${1:-}" in
backup)
  test ! -e "$B" || { echo "$B already exists; stopping"; exit 1; }
  mkdir -m 700 "$B"
  cp -p backup.sh docker-compose.yml Caddyfile.public "$B/"
  cp -p /etc/cron.d/mirai-backup "$B/cron-mirai-backup"
  ls -la "$B"
  ;;

install)
  DEBIAN_FRONTEND=noninteractive apt-get install -y rclone >/dev/null
  rclone version | head -1
  ;;

crypt)
  test ! -e "$CONF_DIR/passwords.txt" || { echo "the passwords exist already; stopping"; exit 1; }
  rclone listremotes | grep -qx gcrypt: && { echo "gcrypt: exists already; stopping"; exit 1; }
  mkdir -p -m 700 "$CONF_DIR"
  umask 077
  p1=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-32)
  p2=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-32)
  [ ${#p1} -eq 32 ] && [ ${#p2} -eq 32 ] || { echo "could not make passwords"; exit 1; }
  rclone config create gcrypt crypt remote gdrive:mirai-inbox-backup password "$p1" password2 "$p2" \
    filename_encryption standard directory_name_encryption true --obscure --non-interactive >/dev/null
  cat > "$CONF_DIR/passwords.txt" <<EOF
Mirai / EduHero 站外备份的加密密码（rclone crypt），建立日期 $(date +%Y-%m-%d)

没有这两个密码，Google Drive 上的备份就打不开，伺服器坏了也救不回来。
请做两件事：
  1. 存进密码管理器（例如 Bitwarden、1Password、Google 密码管理员），名称写「Mirai 备份加密密码」。
  2. 抄一份纸本，跟重要文件放在一起。
都做好之后告诉总管，我们会把桌面上的这个档案删掉。

password (密码):        $p1
password2 (salt, 盐):   $p2

还原时要的其他设定（不是秘密）：
  remote:                    gdrive:mirai-inbox-backup
  filename_encryption:       standard
  directory_name_encryption: true
EOF
  chmod 600 "$CONF_DIR/passwords.txt"
  echo "gcrypt: made; passwords in $CONF_DIR/passwords.txt ($(wc -l < "$CONF_DIR/passwords.txt") lines, not shown)"
  rclone config show gcrypt | sed -E 's/^(password2?) = .*/\1 = (hidden)/'
  ;;

script)
  test -d "$B" || { echo "run backup first"; exit 1; }
  test -s "$NEW/backup.sh" || { echo "missing $NEW/backup.sh"; exit 1; }
  sh -n "$NEW/backup.sh"
  cp "$NEW/backup.sh" backup.sh
  chmod 750 backup.sh
  cat /etc/cron.d/mirai-backup
  ;;

run)
  nice -n 10 /opt/mirai-inbox/backup.sh >> /var/log/mirai-backup.log 2>&1 && echo "backup ok" || echo "backup reported a failure"
  tail -3 /var/log/mirai-backup.log
  cat backup-status/status.json
  ;;

gateway)
  test -d "$B" || { echo "run backup first"; exit 1; }
  mkdir -p backup-status
  python3 - <<'PY'
import pathlib
p = pathlib.Path("Caddyfile.public")
text = p.read_text()
assert "@backup_status" not in text
route = """\t# Last night's backup, for the GitHub "Inbox server watch": times, sizes and failed parts only, no secrets.
\t@backup_status path /backup-status
\thandle @backup_status {
\t\troot * /srv/backup-status
\t\trewrite * /status.json
\t\theader Content-Type application/json
\t\theader Cache-Control no-store
\t\tfile_server
\t}

"""
# The first site (Mirai, :3200) ends with its catch-all; the route goes just before it.
anchor = "\thandle {\n\t\trespond \"Not found\" 404\n\t}\n}\n"
at = text.index(anchor)  # the first one is Mirai's (EduHero's site comes after it)
p.write_text(text[:at] + route + text[at:])
c = pathlib.Path("docker-compose.yml")
compose = c.read_text()
old = "      - ./Caddyfile.public:/etc/caddy/Caddyfile:ro\n"
assert compose.count(old) == 1 and "/srv/backup-status" not in compose
c.write_text(compose.replace(old, old + "      - ./backup-status:/srv/backup-status:ro\n", 1))
PY
  docker compose config -q
  docker compose exec -T public-gateway caddy validate --config /dev/stdin --adapter caddyfile < Caddyfile.public 2>&1 | grep -E "Valid configuration|Error"
  # Recreated (a new volume needs it): both inboxes are away for a few seconds.
  docker compose up -d --no-deps public-gateway
  sleep 3
  curl -s -m 10 http://127.0.0.1:3200/backup-status -H 'Host: wa.miraischool.asia' | head -c 300; echo
  ;;

token)
  test -s "$NEW/github-token" || { echo "no $NEW/github-token"; exit 1; }
  mkdir -p -m 700 "$CONF_DIR"
  tr -d '\r\n ' < "$NEW/github-token" > "$CONF_DIR/github-token"
  chmod 600 "$CONF_DIR/github-token"
  rm -f "$NEW/github-token"
  python3 - "$CONF_DIR/github-token" <<'PY'
import json, sys, urllib.request
token = open(sys.argv[1]).read().strip()
request = urllib.request.Request("https://api.github.com/repos/miraischoolasia/miraiaischoolcrm/issues?state=open&per_page=1",
                                 headers={"Authorization": "Bearer " + token, "User-Agent": "mirai-backup"})
with urllib.request.urlopen(request, timeout=20) as response:
    print("GitHub token works (can read the repository's issues):", response.status)
PY
  ;;

check)
  rclone version 2>/dev/null | head -1 || echo "no rclone"
  echo "remotes: $(rclone listremotes 2>/dev/null | tr '\n' ' ')"
  [ -s "$CONF_DIR/passwords.txt" ] && echo "passwords kept on the server: yes"
  [ -s "$CONF_DIR/github-token" ] && echo "GitHub token: yes" || echo "GitHub token: not yet"
  cat /etc/cron.d/mirai-backup
  [ -f backup-status/status.json ] && cat backup-status/status.json
  ;;

rollback)
  test -d "$B" || { echo "no backup folder $B"; exit 1; }
  cp -p "$B/backup.sh" backup.sh
  cp -p "$B/cron-mirai-backup" /etc/cron.d/mirai-backup
  if ! cmp -s "$B/docker-compose.yml" docker-compose.yml || ! cmp -s "$B/Caddyfile.public" Caddyfile.public; then
    cp -p "$B/docker-compose.yml" docker-compose.yml
    cat "$B/Caddyfile.public" > Caddyfile.public
    docker compose up -d --no-deps public-gateway
  fi
  echo "old backup back; rclone, its settings and what is on the Drive stay"
  ;;

*)
  echo "usage: sh setup.sh backup | install | crypt | script | run | gateway | token | check | rollback"; exit 2
  ;;
esac
