"""Brings the Messenger / Instagram chats of GoHighLevel into the CRM inbox (Chatwoot) with their real times.

The bridge (ghl_bridge.py) only hears what a person writes ("Customer Replied") and what the CRM itself sends. What
GoHighLevel sent on its own (workflows, replies typed in GoHighLevel or on Facebook) and everything from before the
bridge was installed never reached the CRM. This script reads each chat's full history from GoHighLevel and adds the
messages the CRM does not have, with the time they were really sent.

It runs on the VPS host (not in the bridge container) because it writes the messages straight into Chatwoot's database:
Chatwoot's API cannot set a message's time, and a message made through the API would also be sent to the person again.
Nothing here is sent to GoHighLevel or to anyone.

  python3 ghl_history.py                        what would be added (changes nothing)
  python3 ghl_history.py --apply                add it
  python3 ghl_history.py --apply --recent 30    only chats whose last GoHighLevel message is from the last 30 minutes
                                                (this is what the timer runs, so new messages follow within minutes)
  python3 ghl_history.py --contact <ghl id>     one contact only
  python3 ghl_history.py --watch 3              keep running: every 3 seconds one call asks GoHighLevel which chats
                                                changed, and only those are read and added (the service
                                                eduhero-ghl-watch runs this)

Every added message has source_id "ghl:<GoHighLevel message id>" and content_attributes {"ghl_import": true}
(stored as a JSON *string*, which is how Chatwoot's own store coder keeps it - an object makes its API answer 500), so a
run can be repeated safely and the whole import can be removed with
  delete from messages where source_id like 'ghl:%' and content_attributes::text like '%ghl_import%';

Settings (environment): GHL_TOKEN, ACCOUNT_ID, INBOX_ID, PAGE_INBOXES (as in ghl-bridge-eduhero.env), and
POSTGRES_USERNAME / POSTGRES_DATABASE (as in chatwoot.env). GHL_LOCATION_ID is read from the first contact when unset.
"""

import argparse
import collections
import datetime
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import warnings

warnings.filterwarnings("ignore", category=DeprecationWarning)  # utcnow() / utcfromtimestamp() on the VPS's newer Python

GHL_TOKEN = os.environ.get("GHL_TOKEN", "")
GHL_API_URL = os.environ.get("GHL_API_URL", "https://services.leadconnectorhq.com").rstrip("/")
ACCOUNT_ID = int(os.environ.get("ACCOUNT_ID", "2"))
INBOX_ID = int(os.environ.get("INBOX_ID", "0") or 0)
COMPOSE_DIR = os.environ.get("COMPOSE_DIR", "/opt/mirai-inbox")
COMPOSE_PROJECT = os.environ.get("COMPOSE_PROJECT", "whatsapp-inbox-test")
PG_SERVICE = os.environ.get("PG_SERVICE", "cw-postgres")
PG_USER = os.environ.get("POSTGRES_USERNAME", "")
PG_DB = os.environ.get("POSTGRES_DATABASE", "")
LOCATION_ID = os.environ.get("GHL_LOCATION_ID", "")
PREFIX = "ghl:"
MAX_TEXT = 4000
SAME_MESSAGE_SECONDS = 180  # the CRM's own copy of a message and GoHighLevel's differ by a few seconds
KINDS = ("TYPE_FACEBOOK", "TYPE_INSTAGRAM")


def read_page_inboxes(text):
    found = {}
    for part in text.split(","):
        page, _, inbox = part.strip().partition(":")
        if page.isdigit() and inbox.isdigit():
            found[page] = int(inbox)
    return found


PAGE_INBOXES = read_page_inboxes(os.environ.get("PAGE_INBOXES", ""))


def log(*parts):
    print(time.strftime("%H:%M:%S"), *parts, flush=True)


def ghl_get(path, version="2021-04-15"):
    request = urllib.request.Request(
        GHL_API_URL + path,
        headers={
            "Authorization": "Bearer " + GHL_TOKEN,
            "Version": version,
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; MiraiCrmGhlHistory/1.0)",  # without one Cloudflare answers 1010
        },
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                time.sleep(0.05)  # GoHighLevel allows about 100 calls per 10 seconds
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt < 3:
                time.sleep(3 * (attempt + 1))
                continue
            raise
    raise RuntimeError("unreachable")


def psql(sql):
    out = subprocess.run(
        ["docker", "compose", "-p", COMPOSE_PROJECT, "exec", "-T", PG_SERVICE, "psql", "-U", PG_USER, "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-At"],
        input=sql, cwd=COMPOSE_DIR, capture_output=True, text=True, timeout=300,
    )
    if out.returncode != 0:
        raise RuntimeError("psql failed: " + out.stderr[:500])
    return out.stdout


def rows(sql):
    text = psql("select coalesce(json_agg(t), '[]'::json) from (" + sql + ") t;").strip()
    return json.loads(text) if text else []


def quote(value):
    return "'" + str(value).replace("\x00", "").replace("'", "''") + "'"


def squash(text):
    return re.sub(r"\s+", " ", text or "").strip()


def stamp(value):
    """GoHighLevel writes 2026-10-15T07:25:17.498Z; Chatwoot keeps UTC without a zone."""
    moment = datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return moment.astimezone(datetime.timezone.utc).replace(tzinfo=None)


def message_text(message):
    body = (message.get("body") or "").strip()
    template = message.get("customTemplate") if isinstance(message.get("customTemplate"), dict) else {}
    if not body and template:
        # An interactive message: its text, then its buttons (the person pressed one of these titles).
        titles = [b.get("title") for b in (template.get("buttons") or []) if isinstance(b, dict) and b.get("title")]
        buttons = "\n[Buttons: " + " | ".join(titles) + "]" if titles else ""
        body = ((template.get("text") or "").strip() + buttons).strip()
    urls = [a for a in (message.get("attachments") or []) if isinstance(a, str) and a.startswith("http")]
    return ((body + "\n" if body and urls else body) + "\n".join(urls))[:MAX_TEXT]


def ghl_messages(conversation_id, max_pages=200, page_size=100):
    found, last = [], None
    for _ in range(max_pages):
        query = "?limit=%d" % page_size + ("&lastMessageId=" + urllib.parse.quote(last) if last else "")
        data = (ghl_get("/conversations/%s/messages%s" % (conversation_id, query)).get("messages")) or {}
        batch = data.get("messages") or []
        found += batch
        last = data.get("lastMessageId")
        if not batch or not data.get("nextPage") or not last:
            break
    return found


def load_chats():
    """The CRM's chats of GoHighLevel people, by GoHighLevel contact id."""
    chats = rows(
        "select ct.id as contact, ct.name, ct.identifier, c.id as conv, c.inbox_id from conversations c "
        "join contacts ct on ct.id = c.contact_id where c.account_id = %d and ct.identifier like 'ghl:%%' order by c.id" % ACCOUNT_ID
    )
    by_contact = collections.defaultdict(list)
    for chat in chats:
        by_contact[chat["identifier"][len(PREFIX):]].append(chat)
    return by_contact


def collect(by_contact, location, since=None, newest_page_only=False, settle=0, known=None):
    """What GoHighLevel has for these contacts that the CRM does not: (plan, report, types, unsettled contacts).

    plan: (conversation, chatwoot contact, direction, text, when, ghl message id, failed, error).
    since: only contacts whose last message is newer than this moment.
    newest_page_only: read only the newest 20 messages of a chat, and compare them with the CRM's newest 100 (enough to
    follow a chat that is already caught up, and quicker).
    known: GoHighLevel contact id -> its conversation ids, when the caller already knows them (the watcher does): the
    search for them is skipped.
    settle: a message FROM the person this young (seconds) is left for the bridge, which gets it by webhook a moment
    later; taking it here too would add it twice. Those contacts come back in the last item to be looked at again.
    """
    plan, report, types, unsettled = [], [], collections.Counter(), set()
    now = datetime.datetime.utcnow()
    for ghl_contact, convs in by_contact.items():
        name = convs[0]["name"]
        try:
            if not location:
                location = (ghl_get("/contacts/" + ghl_contact, "2021-07-28").get("contact") or {}).get("locationId") or ""
            if known and known.get(ghl_contact):
                found = [{"id": conversation_id} for conversation_id in known[ghl_contact]]
            else:
                found = ghl_get("/conversations/search?" + urllib.parse.urlencode({"locationId": location, "contactId": ghl_contact})).get("conversations") or []
            if since and not any(
                isinstance(f.get("lastMessageDate"), (int, float))
                and datetime.datetime.utcfromtimestamp(f["lastMessageDate"] / 1000) >= since
                for f in found
            ):
                continue
            theirs = [m for f in found for m in ghl_messages(f["id"], 1 if newest_page_only else 200, 20 if newest_page_only else 100)]
        except Exception as error:  # noqa: BLE001 - one contact failing must not stop the rest
            report.append((name, "GoHighLevel error: %s %s" % (type(error).__name__, str(error)[:80])))
            continue

        newest_only = " order by id desc limit 100" if newest_page_only else ""
        existing = {c["conv"]: rows(
            "select id, message_type, content, created_at, source_id from messages where conversation_id = %d and private = false%s" % (c["conv"], newest_only)
        ) for c in convs}
        taken = set()  # existing message ids already matched to one of theirs
        have_ids = {m["source_id"] for ms in existing.values() for m in ms if m["source_id"]}
        added = collections.Counter()
        for message in sorted(theirs, key=lambda m: m.get("dateAdded") or ""):
            types[message.get("messageType")] += 1
            if message.get("messageType") not in KINDS:
                continue
            text = message_text(message)
            if not text:
                types["(empty)"] += 1
                continue
            if PREFIX + message["id"] in have_ids:
                continue
            page = str(((message.get("meta") or {}).get("fb") or {}).get("pageId") or "")
            inbox = PAGE_INBOXES.get(page, INBOX_ID)
            target = next((c for c in convs if c["inbox_id"] == inbox), None) or max(convs, key=lambda c: c["conv"])
            direction = 0 if message.get("direction") == "inbound" else 1
            when = stamp(message["dateAdded"])
            if settle and direction == 0 and (now - when).total_seconds() < settle:
                unsettled.add(ghl_contact)
                continue
            twin = None
            for old in existing[target["conv"]]:
                if old["id"] in taken or old["message_type"] != direction:
                    continue
                gap = abs((datetime.datetime.fromisoformat(old["created_at"]) - when).total_seconds())
                if gap <= SAME_MESSAGE_SECONDS and squash(old["content"]) == squash(text):
                    twin = old
                    break
            if twin is not None:
                taken.add(twin["id"])
                continue
            failed = message.get("status") == "failed"
            plan.append((target["conv"], target["contact"], direction, text, when, message["id"], failed, str(message.get("error") or "")[:200]))
            added[direction] += 1
        if added:
            report.append((name, "adds %d from them, %d from us (GoHighLevel has %d messages)" % (added[0], added[1], len(theirs))))
    return plan, report, types, unsettled


def write(plan):
    statements = ["begin;"]
    for conv, contact, direction, text, when, ghl_id, failed, error in plan:
        attributes = {"ghl_import": True, **({"external_error": error or "GoHighLevel could not send this message"} if failed else {})}
        when_sql = quote(when.isoformat(sep=" ", timespec="milliseconds"))
        statements.append(
            "insert into messages (content, account_id, inbox_id, conversation_id, message_type, created_at, updated_at, private, status, "
            "source_id, content_type, content_attributes, sender_type, sender_id) "
            "select %s, c.account_id, c.inbox_id, c.id, %d, %s, %s, false, %d, %s, 0, to_json(%s::text), %s, %s "
            "from conversations c where c.id = %d;"
            % (quote(text), direction, when_sql, when_sql, 3 if failed else 0, quote(PREFIX + ghl_id), quote(json.dumps(attributes)),
               "'Contact'" if direction == 0 else "null", contact if direction == 0 else "null", conv)
        )
    for conv in sorted({p[0] for p in plan}):
        newest = max(p[4] for p in plan if p[0] == conv)
        statements.append(
            "update conversations set last_activity_at = greatest(last_activity_at, %s) where id = %d;"
            % (quote(newest.isoformat(sep=" ", timespec="milliseconds")), conv)
        )
    statements.append("commit;")
    psql("\n".join(statements))


def watch(interval, catch_up_minutes=30, settle=30):
    """Follow GoHighLevel closely: one call every few seconds asks which conversations changed last, and only those are read.

    One location-wide search (the 40 conversations with the newest message) costs one API call per tick, far inside
    GoHighLevel's limits (100 calls per 10 seconds, 200,000 per day). A chat whose newest message moved is read and
    its new messages are added. As a safety net, each tick also looks at one more chat in turn (so every chat is
    looked at again every few minutes) without holding up the fast path for long.
    """
    by_contact = load_chats()
    location = LOCATION_ID
    for contact in by_contact:  # a contact GoHighLevel no longer has (a test one) answers 400: ask the next
        if location:
            break
        try:
            location = (ghl_get("/contacts/" + contact, "2021-07-28").get("contact") or {}).get("locationId") or ""
        except urllib.error.HTTPError:
            continue
    if not location:
        sys.exit("GoHighLevel location is not known")

    def follow(subset, **options):
        began = time.time()
        plan, _report, _types, unsettled = collect(subset, location, **options)
        read_seconds = time.time() - began
        if plan:
            write(plan)
            age = max((datetime.datetime.utcnow() - p[4]).total_seconds() for p in plan)
            log("Added", len(plan), "messages (from the person %d, from us %d); the oldest was sent %.1f s ago; read %.1f s, wrote %.1f s" % (
                sum(1 for p in plan if p[2] == 0), sum(1 for p in plan if p[2] == 1), age, read_seconds, time.time() - began - read_seconds))
        return unsettled

    log("Watching GoHighLevel every", interval, "s; catching up the last", catch_up_minutes, "minutes first")
    # Catch up on what came while the watcher was not running: the chats whose newest message is recent, found with one call.
    since_ms = (time.time() - catch_up_minutes * 60) * 1000
    recent: dict[str, list[str]] = {}
    for chat in ghl_get("/conversations/search?" + urllib.parse.urlencode(
        {"locationId": location, "sortBy": "last_message_date", "sort": "desc", "limit": 100}
    )).get("conversations") or []:
        if isinstance(chat.get("lastMessageDate"), (int, float)) and chat["lastMessageDate"] >= since_ms and chat.get("lastMessageType") in KINDS:
            recent.setdefault(chat.get("contactId"), []).append(chat["id"])
    follow({c: by_contact[c] for c in recent if c in by_contact}, known=recent)
    last_seen: dict[str, float] = {}
    retry: dict[str, float] = {}
    sweep: list[str] = []
    last_reload = time.time()
    first = True
    while True:
        started = time.time()
        try:
            found = ghl_get("/conversations/search?" + urllib.parse.urlencode(
                {"locationId": location, "sortBy": "last_message_date", "sort": "desc", "limit": 40}
            )).get("conversations") or []
            changed = set()
            conversations: dict[str, list[str]] = {}
            for chat in found:
                moved = chat.get("lastMessageDate")
                if not isinstance(moved, (int, float)):
                    continue
                if not first and moved > last_seen.get(chat["id"], 0) and chat.get("lastMessageType") in KINDS:
                    changed.add(chat.get("contactId"))
                    conversations.setdefault(chat.get("contactId"), []).append(chat["id"])
                last_seen[chat["id"]] = max(moved, last_seen.get(chat["id"], 0))
            first = False
            # A person the CRM has not met yet (the bridge is still making the chat), or a refresh now and then.
            if any(c not in by_contact for c in changed) or started - last_reload > 60:
                by_contact = load_chats()
                last_reload = started
            for contact in [c for c, due in retry.items() if due <= started]:
                changed.add(contact)
                del retry[contact]
            subset = {c: by_contact[c] for c in changed if c in by_contact}
            if subset:
                for contact in follow(subset, newest_page_only=True, settle=settle, known=conversations):
                    retry[contact] = started + settle + 5
            if not sweep:
                sweep = list(by_contact)
            next_contact = sweep.pop()
            if next_contact in by_contact and next_contact not in subset:
                for contact in follow({next_contact: by_contact[next_contact]}, newest_page_only=True, settle=settle):
                    retry[contact] = started + settle + 5
        except Exception as error:  # noqa: BLE001 - keep following; the next tick tries again
            log("Tick failed:", type(error).__name__, str(error)[:200])
        time.sleep(max(0.5, interval - (time.time() - started)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--recent", type=int, default=0, help="only chats whose last message is newer than this many minutes")
    parser.add_argument("--contact", default="")
    parser.add_argument("--show", type=int, default=12, help="how many chats to list in the summary")
    parser.add_argument("--watch", type=float, default=0, help="keep running and follow GoHighLevel every this many seconds")
    args = parser.parse_args()
    if not (GHL_TOKEN and PG_USER and PG_DB):
        sys.exit("GHL_TOKEN, POSTGRES_USERNAME and POSTGRES_DATABASE must be set")
    if args.watch:
        watch(args.watch)
        return

    by_contact = load_chats()
    if args.contact:
        by_contact = {k: v for k, v in by_contact.items() if k == args.contact}
    since = datetime.datetime.utcnow() - datetime.timedelta(minutes=args.recent) if args.recent else None
    plan, report, types, _unsettled = collect(by_contact, LOCATION_ID, since=since)

    inbound = sum(1 for p in plan if p[2] == 0)
    log("chats checked:", len(by_contact), "| to add:", len(plan), "(from the person %d, from us %d)" % (inbound, len(plan) - inbound), "| of those failed to send:", sum(1 for p in plan if p[6]))
    log("GoHighLevel message types seen:", dict(types))
    for name, line in report[: args.show]:
        log(" ", name, "-", line)
    if len(report) > args.show:
        log("  ... and", len(report) - args.show, "more chats")
    if not args.apply:
        log("Dry run: nothing was written. Run again with --apply to add them.")
        return
    if not plan:
        return
    write(plan)
    log("Added", len(plan), "messages.")


if __name__ == "__main__":
    main()
