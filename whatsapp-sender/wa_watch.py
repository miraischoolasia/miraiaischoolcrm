"""Watches every WhatsApp number on the server and says so at once when one stops working, with the next step.

Every 30 seconds it reads the state of each number from each Evolution (fetchInstances), works out one of

  connected | reconnecting | logged_out | replaced | restricted | needs_qr | quiet

and, when that changes, writes it to the school's CRM database (report_whatsapp_number_status, which the CRM's red
bar reads; migration 20261027950000). When a number goes bad it sends a WhatsApp note to the team's phones
(alert_phones) from another number that still works (the same school's first, else the other school's), and opens a
GitHub issue (label whatsapp-number), saying what happened and what to do; when it is fine again it says so once and
closes the issue. Each happening is told once. From 23:00 to 08:00 Kuala Lumpur only a logout or a restriction is
told at once; the rest waits for 08:00. The note starts with SYSTEM_ALERT_MARK, which the CRM's chat-activity
ignores (no lead moves, no automation runs); the inbox copy keeps it as a message the school sent (never unread).

  - logged_out, replaced and restricted are told at once; reconnecting and needs_qr only after 2 minutes (a number
    often drops for a few seconds and comes back by itself);
  - quiet: linked, but no message has come in for 2 hours of working time (09:00-21:00 Kuala Lumpur);
  - a number the school has no Chatwoot inbox for (an old, unused one) is left alone.

It only reads Evolution and Chatwoot: it never links, logs out or sends anything. Which numbers there are is found
again every 10 minutes from each school's Chatwoot inboxes (the inbox's webhook names the number), so a number
added from the CRM is watched by itself.

Settings: a JSON file (WA_WATCH_CONFIG, default /app/wa-watch.json):
  {"chatwoot_url": "http://chatwoot-rails:3000",
   "evolutions": [{"url": "http://evolution-api:8080", "key": "..."}, ...],
   "schools": [{"name": "Mirai", "account": 1, "chatwoot_token": "...", "supabase_url": "...",
                "supabase_key": "<publishable>", "reporter_key": "<whatsapp_status_reporter key>",
                "crm_url": "https://crm.miraischool.asia"}, ...],
   "alert_phones": ["60...", ...], "github_token": "", "github_repo": "miraischoolasia/miraiaischoolcrm"}
Keys are never written to the log. Source: whatsapp-sender/wa_watch.py in the CRM repo.
"""

import datetime
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Docker's DNS sometimes fails the IPv6 half of a lookup (as in gateway_auth.py).
_lookup = socket.getaddrinfo


def _ipv4_only(host, port, family=0, *args, **kwargs):
    return _lookup(host, port, socket.AF_INET, *args, **kwargs)


socket.getaddrinfo = _ipv4_only

TICK_SECONDS = 30
INBOXES_EVERY = 600
LAST_MESSAGE_EVERY = 300
CHECKED_EVERY = 300
GRACE_SECONDS = 120
REMIND_EVERY = float("inf")  # each happening is told once
NIGHT_FROM, NIGHT_UNTIL = 23, 8
URGENT = ("logged_out", "restricted")
SYSTEM_ALERT_MARK = "【CRM 系统提醒】"  # the same words as SYSTEM_ALERT_MARK in supabase/functions/chat-activity/logic.ts
QUIET_AFTER = 2 * 3600
WORK_FROM, WORK_UNTIL = 9, 21
KL = datetime.timezone(datetime.timedelta(hours=8))
WEBHOOK_PATH = "/chatwoot/webhook/"
BAD = ("logged_out", "replaced", "restricted", "needs_qr", "reconnecting", "quiet")
AT_ONCE = ("logged_out", "replaced", "restricted")

WORDS = {
    "logged_out": ("被登出了", "手机上的「已连结的装置」被移除，或手机的 WhatsApp 重新登入过。",
                   "到 CRM → Inbox → Numbers，在「{label}」按「连结」，用那支手机扫 QR。"),
    "replaced": ("被别处挤掉了", "同一个号码在别的地方（WhatsApp Web 或桌面版）也连上了。",
                 "先关掉别处的 WhatsApp Web 或桌面版，再到 Numbers 按「{label}」的「连结」。"),
    "restricted": ("可能被 WhatsApp 限制或封号", "WhatsApp 拒绝了这个号码。",
                   "打开那支手机的 WhatsApp 看有没有警告；先在 Automations 暂停自动发送、不要群发。"),
    "needs_qr": ("还没连上", "这个号码还没扫 QR，或 QR 过期了。", "到 Numbers 按「{label}」的「连结」扫 QR。"),
    "reconnecting": ("断线了，正在自己重连", "伺服器跟 WhatsApp 的连线断了。",
                     "先等等；超过 30 分钟还没好，请服务器部门检查。"),
    "quiet": ("很久没有新消息", "上班时间超过 2 小时没有收到任何消息。",
              "打开那支手机看看有没有新消息；手机上有、CRM 没有的话，请通知服务器部门。"),
}


def log(*parts):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *parts, flush=True)


def http(method, url, headers=None, body=None, timeout=20):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method,
                                     headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        return error.code, None


# ---------- what state a number is in ----------

def classify(info):
    """(status, reason) from one entry of Evolution's fetchInstances."""
    state = info.get("connectionStatus")
    code = info.get("disconnectionReasonCode")
    detail = info.get("disconnectionObject")
    detail = detail if isinstance(detail, str) else json.dumps(detail or "")
    kind = next((word for word in ("device_removed", "replaced", "loggedOut", "banned", "forbidden") if word in detail), "")
    reason = " ".join(str(part) for part in (code, kind) if part) or None
    if state == "open":
        return "connected", None
    if state == "connecting":
        return "reconnecting", reason
    if code == 401 or kind in ("device_removed", "loggedOut"):
        return "logged_out", reason
    if code == 440 or kind == "replaced":
        return "replaced", reason
    if code == 403 or kind in ("banned", "forbidden"):
        return "restricted", reason
    if code in (408, 428, 500, 503, 515):
        return "reconnecting", reason
    if not info.get("ownerJid"):
        return "needs_qr", reason
    return "reconnecting", reason or "closed"


def working_seconds_since(start, now):
    """Seconds of working time (09:00-21:00 Kuala Lumpur, every day) between two moments."""
    total, moment = 0.0, start
    while moment < now:
        local = moment.astimezone(KL)
        day_from = local.replace(hour=WORK_FROM, minute=0, second=0, microsecond=0)
        day_until = local.replace(hour=WORK_UNTIL, minute=0, second=0, microsecond=0)
        begin, end = max(local, day_from), min(now.astimezone(KL), day_until)
        if end > begin:
            total += (end - begin).total_seconds()
        moment = (local + datetime.timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return total


def is_quiet(last_message, watched_since, now):
    """No message for 2 hours of working time (counted from the later of the last message and when watching began)."""
    start = max(t for t in (last_message, watched_since) if t is not None)
    return working_seconds_since(start, now) >= QUIET_AFTER


# ---------- one number ----------

class Number:
    def __init__(self, school, instance, inbox_id, label, now):
        self.school, self.instance, self.inbox_id, self.label = school, instance, inbox_id, label
        self.status, self.reason = None, None
        self.bad_since = None
        self.told = None            # the bad status last told about
        self.told_at = 0.0
        self.written, self.written_at = None, 0.0
        self.watched_since = now
        self.last_message = None
        self.last_message_checked = 0.0
        self.evolution = None   # the Evolution server it is on (to send a note from it)
        self.held = None        # (kind, status) kept from the night for 08:00

    def step(self, status, reason, now_ts):
        """Takes the new state; returns ('bad', status) to tell, ('fine', old) when it recovered, or None."""
        if status != "connected" and status in BAD:
            if self.status != status:
                self.bad_since = now_ts
            self.status, self.reason = status, reason
            due = status in AT_ONCE or now_ts - self.bad_since >= GRACE_SECONDS
            if due and (self.told != status or now_ts - self.told_at >= REMIND_EVERY):
                self.told, self.told_at = status, now_ts
                return "bad", status
            return None
        was = self.told
        self.status, self.reason, self.bad_since = status, reason, None
        if was:
            self.told, self.told_at = None, 0.0
            return "fine", was
        return None


# ---------- telling ----------

def night(now):
    hour = now.astimezone(KL).hour
    return hour >= NIGHT_FROM or hour < NIGHT_UNTIL


def note_text(number, kind, status, now):
    """The WhatsApp note: which school, which number, what happened, what to do."""
    school = number.school["name"]
    when = now.astimezone(KL).strftime("%H:%M")
    head = f"{SYSTEM_ALERT_MARK}{school} 的 WhatsApp 号码「{number.label}」"
    if kind == "bad":
        short, what, todo = WORDS[status]
        text = f"{head}{short}（{when}）。\n{what}\n下一步：{todo.format(label=number.label)}"
        return text + (f"\n（技术原因：{number.reason}）" if number.reason else "")
    if kind == "night":
        return f"{head}昨晚曾经{WORDS[status][0]}，现在已经恢复正常（{when}），不用处理。"
    return f"{head}已经恢复正常（{when}）。之前：{WORDS[status][0]}。"


def sender_for(numbers, number, kind):
    """A number that works to send from: another of the same school, else one of the other school (for a recovery
    the number itself may send too). None when none works."""
    working = [n for n in numbers.values() if n.status in ("connected", "quiet") and n.evolution]
    others = [n for n in working if n is not number]
    same = [n for n in others if n.school is number.school]
    if same or others:
        return (same or others)[0]
    return number if kind != "bad" and number in working else None


def send_note(config, sender, text):
    sent = 0
    for phone in config.get("alert_phones") or []:
        status, _ = http("POST", f"{sender.evolution['url'].rstrip('/')}/message/sendText/{urllib.parse.quote(sender.instance)}",
                         {"apikey": sender.evolution["key"]}, {"number": phone, "text": text})
        sent += 200 <= status < 300
    return sent


def notify(config, numbers, number, kind, status, now):
    """Tells the team (WhatsApp note + GitHub), or keeps it for 08:00 at night."""
    if night(now) and not (kind == "bad" and status in URGENT):
        if kind == "fine" and number.held and number.held[0] == "bad":
            number.held = ("night", number.held[1])   # bad and fine again in the night: one short morning note
        elif kind == "fine" and number.held and number.held[0] == "night":
            pass
        else:
            number.held = (kind, status)
        log("held for the morning:", number.instance, kind, status)
        return
    number.held = None   # what is told now replaces anything kept from the night
    text = note_text(number, kind, status, now)
    sender = sender_for(numbers, number, kind)
    if sender is None:
        log("no working number to send the note from:", number.instance, kind, status)
    else:
        sent = send_note(config, sender, text)
        log(f"note about {number.instance} ({kind} {status}) sent from {sender.instance} to {sent} phone(s)")
    github(config, number, "fine" if kind == "night" else kind, text.split("\n", 1)[0].replace(SYSTEM_ALERT_MARK, ""), text)


def morning(config, numbers, now):
    """At 08:00 the notes kept in the night go out (a bad one that came right again becomes a short note)."""
    if night(now):
        return
    for number in numbers.values():
        if number.held:
            kind, status = number.held
            number.held = None
            if kind == "bad" and number.status == "connected":
                kind = "night"
            elif kind == "bad" and number.status in BAD:
                status = number.status   # how it is now, not how it was at night
            notify(config, numbers, number, kind, status, now)


def github(config, number, kind, title, body):
    token, repo = config.get("github_token"), config.get("github_repo")
    if not token or not repo:
        return
    headers = {"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json", "User-Agent": "mirai-wa-watch"}
    api = f"https://api.github.com/repos/{repo}/issues"
    marker = f"[{number.instance}]"
    status, found = http("GET", api + "?state=open&labels=whatsapp-number&per_page=50", headers)
    open_one = next((i for i in (found or []) if marker in (i.get("title") or "")), None) if status == 200 else None
    if kind == "bad" and not open_one:
        made, _ = http("POST", api, headers, {"title": f"{title} {marker}", "body": body, "labels": ["whatsapp-number"]})
        if made >= 400:
            http("POST", api, headers, {"title": f"{title} {marker}", "body": body})
    elif kind == "fine" and open_one:
        http("POST", f"{api}/{open_one['number']}/comments", headers, {"body": body})
        http("PATCH", f"{api}/{open_one['number']}", headers, {"state": "closed"})


def report(number, now_ts):
    """Writes the state to the school's CRM when it changed, and the check time every 5 minutes."""
    school = number.school
    if not school.get("reporter_key") or not school.get("supabase_url"):
        return
    changed = number.written != number.status
    if not changed and now_ts - number.written_at < CHECKED_EVERY:
        return
    last = number.last_message.isoformat() if number.last_message else None
    status, _ = http("POST", school["supabase_url"].rstrip("/") + "/rest/v1/rpc/report_whatsapp_number_status",
                     {"apikey": school["supabase_key"]},
                     {"p_key": school["reporter_key"], "p_instance": number.instance, "p_inbox_id": number.inbox_id,
                      "p_status": number.status, "p_reason": number.reason, "p_last_message_at": last, "p_label": number.label})
    if 200 <= status < 300:
        number.written, number.written_at = number.status, now_ts
    else:
        log("could not write", number.instance, "to", school["name"], "- HTTP", status)


# ---------- the loop ----------

def find_numbers(config):
    """{(evolution host, instance): (school, inbox id, inbox name)} from each school's Chatwoot inboxes."""
    found = {}
    for school in config["schools"]:
        status, data = http("GET", f"{config['chatwoot_url'].rstrip('/')}/api/v1/accounts/{school['account']}/inboxes",
                            {"api_access_token": school["chatwoot_token"]})
        if status != 200:
            log("could not read the inboxes of", school["name"], "- HTTP", status)
            continue
        for inbox in (data or {}).get("payload", []):
            url = (inbox.get("webhook_url") or "").split("?", 1)[0]
            if WEBHOOK_PATH in url:
                host = urllib.parse.urlparse(url).netloc
                found[(host, url.rsplit(WEBHOOK_PATH, 1)[1])] = (school, inbox["id"], inbox.get("name") or "")
    return found


def last_message(evolution, instance):
    status, data = http("POST", f"{evolution['url'].rstrip('/')}/chat/findMessages/{urllib.parse.quote(instance)}",
                        {"apikey": evolution["key"]}, {"where": {"key": {"fromMe": False}}, "page": 1, "offset": 1})
    records = ((data or {}).get("messages") or {}).get("records") or [] if status in (200, 201) else []
    stamp = records[0].get("messageTimestamp") if records else None
    return datetime.datetime.fromtimestamp(int(stamp), datetime.timezone.utc) if stamp else None


def test_note(config, instance):
    """Sends one test note to the alert phones from the given number (to see that they arrive)."""
    places = find_numbers(config)
    for evolution in config["evolutions"]:
        host = urllib.parse.urlparse(evolution["url"]).netloc
        place = places.get((host, instance))
        if place:
            number = Number(place[0], instance, place[1], place[2] or instance, datetime.datetime.now(datetime.timezone.utc))
            number.evolution = evolution
            text = (f"{SYSTEM_ALERT_MARK}测试：这是号码监测的测试消息，从 {place[0]['name']} 的「{number.label}」发出。"
                    "以后号码断线、被登出或被限制时，会像这样通知你。不用回覆。")
            print("sent to", send_note(config, number, text), "phone(s)")
            return
    print("no such number:", instance)


def main():
    config = json.load(open(os.environ.get("WA_WATCH_CONFIG", "/app/wa-watch.json")))
    if len(sys.argv) == 3 and sys.argv[1] == "--test-note":
        return test_note(config, sys.argv[2])
    numbers, places, places_at = {}, {}, 0.0
    log("wa-watch started:", len(config["evolutions"]), "Evolution servers,", len(config["schools"]), "schools")
    while True:
        started = time.time()
        now = datetime.datetime.now(datetime.timezone.utc)
        try:
            if started - places_at >= INBOXES_EVERY or not places:
                places, places_at = find_numbers(config) or places, started
            for evolution in config["evolutions"]:
                host = urllib.parse.urlparse(evolution["url"]).netloc
                status, items = http("GET", evolution["url"].rstrip("/") + "/instance/fetchInstances", {"apikey": evolution["key"]})
                if status != 200:
                    log("could not read", host, "- HTTP", status)
                    continue
                for info in items or []:
                    place = places.get((host, info.get("name")))
                    if not place:
                        continue
                    key = (host, info["name"])
                    school, inbox_id, inbox_name = place
                    number = numbers.get(key)
                    if number is None:
                        number = numbers[key] = Number(school, info["name"], inbox_id, inbox_name or info["name"], now)
                    number.evolution = evolution
                    state, reason = classify(info)
                    if state == "connected":
                        if started - number.last_message_checked >= LAST_MESSAGE_EVERY:
                            number.last_message = last_message(evolution, info["name"]) or number.last_message
                            number.last_message_checked = started
                        if is_quiet(number.last_message, number.watched_since, now):
                            hours = working_seconds_since(max(t for t in (number.last_message, number.watched_since) if t), now) / 3600
                            state, reason = "quiet", f"{hours:.1f} 小时没有新消息"
                    else:
                        number.watched_since = now  # the quiet clock starts again once it is back
                    change = number.step(state, reason, started)
                    if change:
                        notify(config, numbers, number, change[0], change[1], now)
                    report(number, started)
            morning(config, numbers, now)
        except Exception as problem:  # never stop watching because of one bad answer
            log("tick failed:", type(problem).__name__, str(problem)[:200])
        if numbers and not getattr(main, "said_hello", False):
            main.said_hello = True
            log("watching:", ", ".join(f"{n.school['name']}/{n.instance} (inbox {n.inbox_id}) {n.status}" for n in numbers.values()))
        time.sleep(max(1.0, TICK_SECONDS - (time.time() - started)))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
