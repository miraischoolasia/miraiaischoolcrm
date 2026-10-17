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
  python3 ghl_history.py --import-instagram    list the Instagram chats the CRM does not have yet (changes nothing)
  python3 ghl_history.py --import-instagram --apply    make them (through the bridge) and add their messages
  python3 ghl_history.py --import-instagram --days 30  only the chats with a message in the last 30 days
  python3 ghl_history.py --fix-pages           list the chats that sit in the wrong inbox or have no Page on the contact (changes nothing)
  python3 ghl_history.py --fix-pages --apply   write the Page on the contact and move the chat to its Page's inbox
  python3 ghl_history.py --watch 3              keep running: every 3 seconds one call asks GoHighLevel which chats
                                                changed, and only those are read and added (the service
                                                eduhero-ghl-watch runs this)

Every added message has source_id "ghl:<GoHighLevel message id>" and content_attributes {"ghl_import": true}
(stored as a JSON *string*, which is how Chatwoot's own store coder keeps it - an object makes its API answer 500), so a
run can be repeated safely and the whole import can be removed with
  delete from messages where source_id like 'ghl:%' and content_attributes::text like '%ghl_import%';

A person who never wrote back has no chat in the CRM (the bridge only hears replies). For Instagram the CRM makes those
chats too: the watcher does it for every new Instagram chat, and --import-instagram does it for all that exist. The chat
itself (contact and conversation) is made by the bridge (/ghl/ensure), so it is built exactly as a reply would build it;
then this script fills in the messages.

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
# The chats of people who never wrote back that the CRM makes itself (only Instagram: those are asked for).
IMPORT_KINDS = tuple(k.strip() for k in os.environ.get("IMPORT_KINDS", "TYPE_INSTAGRAM").split(",") if k.strip())
BRIDGE_SERVICE = os.environ.get("BRIDGE_SERVICE", "ghl-bridge-eduhero")


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


def is_twin(old, direction, when, text, urls):
    """Is this CRM message (a row of the CRM's own) the same message as GoHighLevel's?

    Same direction, a few seconds apart, and the same words. A photo or voice message the CRM sent has no words and its file
    is an attachment, while GoHighLevel's copy is the file's link: they match when the CRM message has a file and the words
    left of GoHighLevel's (without the links) equal the CRM's (none, or the caption).
    """
    if old["message_type"] != direction:
        return False
    gap = abs((datetime.datetime.fromisoformat(old["created_at"]) - when).total_seconds())
    if gap > SAME_MESSAGE_SECONDS:
        return False
    if squash(old["content"]) == squash(text):
        return True
    if urls and int(old.get("files") or 0) > 0:
        words = squash(" ".join(line for line in text.splitlines() if line.strip() not in urls))
        return squash(old["content"]) == words
    return False


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


BRIDGE_ENSURE = (
    "import json,os,sys,urllib.request as u;"
    "r=u.Request('http://127.0.0.1:'+os.environ.get('PORT','9100')+'/ghl/ensure?key='+os.environ['BRIDGE_KEY'],"
    "data=json.dumps({'contact_id':sys.argv[1],'name':sys.argv[2],'channel':sys.argv[3]}).encode(),"
    "headers={'Content-Type':'application/json'});"
    "print(u.urlopen(r,timeout=60).read().decode())"
)


def chat_name(chat):
    return str(chat.get("contactName") or chat.get("fullName") or chat.get("email") or chat.get("phone") or "")[:100]


def ensure_chat(contact_id, name, channel="IG"):
    """Has the bridge make the CRM contact and conversation of a GoHighLevel person (no message). True when it did."""
    out = subprocess.run(
        ["docker", "compose", "-p", COMPOSE_PROJECT, "exec", "-T", BRIDGE_SERVICE, "python3", "-c", BRIDGE_ENSURE, contact_id, name, channel],
        cwd=COMPOSE_DIR, capture_output=True, text=True, timeout=120,
    )
    if out.returncode != 0:
        log("Could not make the chat of", name or contact_id, "-", (out.stderr or out.stdout)[-160:].strip())
        return False
    return True


def missing_chats(location, by_contact, kinds=IMPORT_KINDS, limit=2000, newer_than_ms=0):
    """GoHighLevel's chats of these kinds whose person the CRM does not have: {contact id: (name, [conversation ids])}.

    Reads the location's chats newest first, 100 a page (the next page starts after the last one's date).
    newer_than_ms: only chats whose last message is newer than this (a time in milliseconds), and reading stops there.
    """
    found: dict[str, tuple[str, list[str]]] = {}
    after = None
    for _ in range(max(1, limit // 100)):
        query = {"locationId": location, "sortBy": "last_message_date", "sort": "desc", "limit": 100}
        if after:
            query["startAfterDate"] = after
        page = ghl_get("/conversations/search?" + urllib.parse.urlencode(query)).get("conversations") or []
        for chat in page:
            contact = chat.get("contactId")
            moved = chat.get("lastMessageDate")
            if newer_than_ms and isinstance(moved, (int, float)) and moved < newer_than_ms:
                continue
            if contact and chat.get("lastMessageType") in kinds and contact not in by_contact:
                name, ids = found.setdefault(contact, (chat_name(chat), []))
                ids.append(chat["id"])
        dates = [c.get("lastMessageDate") for c in page if isinstance(c.get("lastMessageDate"), (int, float))]
        if len(page) < 100 or not dates or (newer_than_ms and min(dates) < newer_than_ms):
            break
        after = min(dates)
    return found


def page_of_conversation(conversation_id):
    """(page id, page name) a GoHighLevel chat writes to, read from the meta.fb / meta.ig of its newest messages."""
    data = ghl_get("/conversations/%s/messages?limit=10" % conversation_id)
    for message in ((data.get("messages") or {}).get("messages") or []):
        account = (message.get("meta") or {}).get("fb") or (message.get("meta") or {}).get("ig") or {}
        if account.get("pageId"):
            return str(account["pageId"]), str(account.get("pageName") or "")
    return "", ""


_page_failed: dict[str, float] = {}  # a person whose Page could not be told: when to ask again


def fix_pages(location, apply, quiet=False):
    """Chats whose contact has no Page written, or that sit in another inbox than their Page's (PAGE_INBOXES).

    A chat made before the bridge could tell the Page (or when GoHighLevel did not answer) went to the default inbox and
    shows as that inbox's Page in the CRM. This reads the Page from GoHighLevel, writes it on the contact
    (ghl_page_id / ghl_page_name) and moves a chat that has no other chat in the right inbox. Only a chat of one
    conversation per person is moved; the rest are listed.

    quiet: for the watcher, which runs this every minute: says something only when it changed something, and does not
    ask again within an hour about a person GoHighLevel could not place.
    """
    chats = rows(
        "select ct.id as contact, ct.name, ct.identifier, ct.additional_attributes->>'ghl_page_id' as page_id, "
        "ct.additional_attributes->>'ghl_page_name' as page_name, c.id as conv, c.inbox_id "
        "from conversations c join contacts ct on ct.id = c.contact_id "
        "where c.account_id = %d and ct.identifier like 'ghl:%%' order by c.id" % ACCOUNT_ID
    )
    by_person = collections.defaultdict(list)
    for chat in chats:
        by_person[chat["identifier"][len(PREFIX):]].append(chat)
    plans, skipped, failed = [], [], []
    for ghl_contact, convs in by_person.items():
        page_id, page_name = convs[0]["page_id"] or "", convs[0]["page_name"] or ""
        if not page_id and quiet and _page_failed.get(ghl_contact, 0) > time.time():
            continue
        if not page_id:
            try:
                found = ghl_get("/conversations/search?" + urllib.parse.urlencode({"locationId": location, "contactId": ghl_contact})).get("conversations") or []
                page_id, page_name = page_of_conversation(found[0]["id"]) if found else ("", "")
            except Exception as error:  # noqa: BLE001 - one person failing must not stop the rest
                failed.append((convs[0]["name"], "%s %s" % (type(error).__name__, str(error)[:60])))
                _page_failed[ghl_contact] = time.time() + 3600
                continue
            if not page_id:
                failed.append((convs[0]["name"], "GoHighLevel does not say which Page"))
                _page_failed[ghl_contact] = time.time() + 3600
                continue
        target = PAGE_INBOXES.get(page_id, INBOX_ID)
        wrong = [c for c in convs if c["inbox_id"] != target]
        if convs[0]["page_id"] and not wrong:
            continue
        if wrong and len(convs) > 1:
            skipped.append((convs[0]["name"], "%d chats, left as they are" % len(convs)))
        moving = [c["conv"] for c in wrong] if len(convs) == 1 else []
        if moving or not convs[0]["page_id"]:
            plans.append((convs[0]["contact"], convs[0]["name"], page_id, page_name, moving, target, not convs[0]["page_id"]))
    if quiet and not plans:
        return
    log("chats to fix:", len(plans), "| not found:", len(failed), "| left alone:", len(skipped))
    kinds = collections.Counter(("page written" if p[6] else "") + (" + moved to inbox %d" % p[5] if p[4] else "") for p in plans)
    for kind, count in kinds.items():
        log("  %s: %d" % (kind.strip(" +") or "nothing", count))
    for name, why in (failed + skipped)[:8]:
        log("  -", name, "-", why)
    if not apply or not plans:
        if not apply:
            log("Dry run: nothing was changed. Run again with --apply.")
        return
    statements = ["begin;"]
    for contact, _name, page_id, page_name, moving, target, write_page in plans:
        if write_page:
            attributes = json.dumps({"ghl_page_id": page_id, "ghl_page_name": page_name})
            statements.append(
                "update contacts set additional_attributes = coalesce(additional_attributes, '{}'::jsonb) || %s::jsonb, updated_at = now() where id = %d;"
                % (quote(attributes), contact)
            )
        for conv in moving:
            statements.append(
                "insert into contact_inboxes (contact_id, inbox_id, source_id, created_at, updated_at) "
                "select %d, %d, gen_random_uuid()::text, now(), now() where not exists "
                "(select 1 from contact_inboxes where contact_id = %d and inbox_id = %d);" % (contact, target, contact, target)
            )
            statements.append(
                "update conversations set inbox_id = %d, contact_inbox_id = (select id from contact_inboxes where contact_id = %d and inbox_id = %d limit 1), "
                "updated_at = now() where id = %d;" % (target, contact, target, conv)
            )
            statements.append("update messages set inbox_id = %d where conversation_id = %d;" % (target, conv))
    statements.append("commit;")
    psql("\n".join(statements))
    log("Done:", len(plans), "chats fixed.")


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
            "select id, message_type, content, created_at, source_id, "
            "(select count(*) from attachments a where a.message_id = messages.id) as files "
            "from messages where conversation_id = %d and private = false%s" % (c["conv"], newest_only)
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
            meta = message.get("meta") or {}
            page = str((meta.get("fb") or meta.get("ig") or {}).get("pageId") or "")
            inbox = PAGE_INBOXES.get(page, INBOX_ID)
            target = next((c for c in convs if c["inbox_id"] == inbox), None) or max(convs, key=lambda c: c["conv"])
            direction = 0 if message.get("direction") == "inbound" else 1
            when = stamp(message["dateAdded"])
            if settle and direction == 0 and (now - when).total_seconds() < settle:
                unsettled.add(ghl_contact)
                continue
            urls = [a for a in (message.get("attachments") or []) if isinstance(a, str) and a.startswith("http")]
            twin = None
            for old in existing[target["conv"]]:
                if old["id"] in taken:
                    continue
                if is_twin(old, direction, when, text, urls):
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
    skipped: dict[str, float] = {}  # a person whose chat could not be made: when to try again
    sweep: list[str] = []
    last_reload = time.time()
    last_fix = 0.0
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
            # A chat that has no Page written, or sits in another inbox than its Page's (GoHighLevel did not say which
            # Page when the chat was made): read the Page again, write it and move the chat. Once a minute.
            if started - last_fix > 60:
                last_fix = started
                fix_pages(location, True, quiet=True)
            # An Instagram person who never wrote back has no chat yet: make it, and read all their messages.
            fresh = {}
            for chat in found:
                contact = chat.get("contactId")
                if (
                    contact and contact not in by_contact and chat.get("lastMessageType") in IMPORT_KINDS
                    and skipped.get(contact, 0) <= started
                ):
                    fresh.setdefault(contact, []).append(chat["id"])
                    if ensure_chat(contact, chat_name(chat)):
                        log("Made the chat of", chat_name(chat) or contact)
                    else:
                        skipped[contact] = started + 300
                        del fresh[contact]
            if fresh:
                by_contact = load_chats()
                last_reload = started
                follow({c: by_contact[c] for c in fresh if c in by_contact}, known=fresh)
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
    parser.add_argument("--import-instagram", action="store_true", help="also make the chats of Instagram people the CRM does not have")
    parser.add_argument("--fix-pages", action="store_true", help="write the Page on contacts that have none and move chats to their Page's inbox")
    parser.add_argument("--days", type=int, default=0, help="with --import-instagram: only chats with a message in the last this many days")
    parser.add_argument("--watch", type=float, default=0, help="keep running and follow GoHighLevel every this many seconds")
    args = parser.parse_args()
    if not (GHL_TOKEN and PG_USER and PG_DB):
        sys.exit("GHL_TOKEN, POSTGRES_USERNAME and POSTGRES_DATABASE must be set")
    if args.watch:
        watch(args.watch)
        return

    by_contact = load_chats()
    if args.fix_pages:
        location = LOCATION_ID
        for contact in by_contact:
            if location:
                break
            try:
                location = (ghl_get("/contacts/" + contact, "2021-07-28").get("contact") or {}).get("locationId") or ""
            except urllib.error.HTTPError:
                continue
        if not location:
            sys.exit("GoHighLevel location is not known")
        fix_pages(location, args.apply)
        return
    if args.import_instagram:
        location = LOCATION_ID
        for contact in by_contact:
            if location:
                break
            try:
                location = (ghl_get("/contacts/" + contact, "2021-07-28").get("contact") or {}).get("locationId") or ""
            except urllib.error.HTTPError:
                continue
        if not location:
            sys.exit("GoHighLevel location is not known")
        absent = missing_chats(location, by_contact, newer_than_ms=int((time.time() - args.days * 86400) * 1000) if args.days else 0)
        log("Instagram chats the CRM does not have:", len(absent))
        for contact, (name, ids) in list(absent.items())[: args.show]:
            log(" ", name or contact)
        if args.apply:
            made = sum(1 for contact, (name, _ids) in absent.items() if ensure_chat(contact, name))
            log("Chats made:", made, "of", len(absent))
            by_contact = load_chats()
        else:
            log("Dry run: nothing was made. Run again with --apply to make them and add their messages.")
            return
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
