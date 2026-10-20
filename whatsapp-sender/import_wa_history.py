#!/usr/bin/env python3
"""Brings the chats a WhatsApp number had before it was linked into the number's Chatwoot inbox, quietly.

When a number is linked, WhatsApp sends part of its older chats (history sync) and Evolution keeps them in its own
database; with Chatwoot's history import off they never reached the inbox. This copies their words into the inbox:

  - straight into Chatwoot's database, not through its API, so nothing is announced: no webhook to Evolution (nothing
    is sent to anyone), none to the CRM's chat-activity (no lead is made, no automation or AI draft runs);
  - a photo, voice note, video, sticker or file becomes the line PLACEHOLDER (with its caption, if any): Evolution
    kept no files, so they cannot be brought;
  - each message once: Chatwoot's source_id "WAID:<WhatsApp id>" is checked first (as Evolution writes it), so a
    message already in the inbox, or one brought by an earlier run, is skipped and the script can run again;
  - a person who already has a chat in this inbox gets the old messages in that chat; anyone else gets a new chat
    that is read and Done (resolved), so the Chats list and the unread badge do not fill up; a new message from the
    parent later reopens it as usual;
  - every message it writes carries content_attributes {"imported_history": TAG}, and every contact, contact inbox and
    chat it makes is written to the journal file, which --rollback uses to take them away again.

A person WhatsApp names only by a hidden ID (...@lid) is saved the way Evolution saves one (identifier "<id>@lid",
phone "+<id>"), so when the parent writes again with the real phone, Evolution's patch 4 moves the phone onto the
same contact. Where Evolution's session knows the phone of a hidden ID (lid-mapping-<id>_reverse.json in an
instance folder), the phone is used instead. Groups, status updates and channels are left out.

Runs on the server, from /opt/mirai-inbox:
  python3 import_wa_history.py --instance eduhero-2 --inbox 6 --account 2 --tag eduhero-2-20261020 \
      --mapping-dir /var/lib/docker/volumes/whatsapp-inbox-test_evo_eduhero_instances/_data/<instance id> ...
                                     dry run: what it would do
  ... --apply --only <jid>,<jid>     a few chats first
  ... --apply                        all of them
  ... --rollback                     takes back everything the journal lists (and every message with the tag)
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import time

PLACEHOLDER = "[旧照片/语音，导入时无法取得]"
COMPOSE_PROJECT = os.environ.get("COMPOSE_PROJECT", "whatsapp-inbox-test")

# A message with no words of its own: it is the file (photo, voice note, ...), so it becomes the placeholder.
MEDIA = ("imageMessage", "audioMessage", "videoMessage", "ptvMessage", "stickerMessage", "lottieStickerMessage",
         "documentMessage", "stickerPackMessage")
# Wrappers around the real message.
WRAPPERS = ("ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension",
            "documentWithCaptionMessage", "associatedChildMessage")
# protocolMessage.type: a message taken back for everyone, and a message edited.
REVOKE = ("0", "REVOKE")
EDIT = ("14", "MESSAGE_EDIT")
SKIP_CHATS = ("@g.us", "@broadcast", "@newsletter")


def log(*parts):
    print(time.strftime("%H:%M:%S"), *parts, flush=True)


# ---------- reading a WhatsApp message ----------

def unwrap(message):
    """The message inside any wrapper (disappearing, view once, document with caption, album child)."""
    for _ in range(5):
        if not isinstance(message, dict):
            return {}
        for wrapper in WRAPPERS:
            inner = message.get(wrapper)
            if isinstance(inner, dict) and isinstance(inner.get("message"), dict):
                message = inner["message"]
                break
        else:
            return message
    return message


def first_text(*values):
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def text_of(message):
    """The words of a message for the inbox, or None when it is not a message a person reads (left out)."""
    m = unwrap(message)
    if not m:
        return None
    if isinstance(m.get("conversation"), str) and m["conversation"].strip():
        return m["conversation"]
    if isinstance(m.get("extendedTextMessage"), dict):
        text = first_text(m["extendedTextMessage"].get("text"))
        return text or None
    for kind in MEDIA:
        if isinstance(m.get(kind), dict):
            caption = first_text(m[kind].get("caption"))
            return PLACEHOLDER + ("\n" + caption if caption else "")
    if isinstance(m.get("interactiveMessage"), dict):
        inner = m["interactiveMessage"]
        return first_text((inner.get("body") or {}).get("text"), (inner.get("header") or {}).get("title")) or None
    if isinstance(m.get("templateMessage"), dict):
        hydrated = m["templateMessage"].get("hydratedTemplate") or m["templateMessage"].get("hydratedFourRowTemplate") or {}
        return first_text(hydrated.get("hydratedContentText")) or None
    if isinstance(m.get("buttonsMessage"), dict):
        return first_text(m["buttonsMessage"].get("contentText")) or None
    if isinstance(m.get("listMessage"), dict):
        return first_text(m["listMessage"].get("description"), m["listMessage"].get("title")) or None
    for kind, field in (("buttonsResponseMessage", "selectedDisplayText"), ("templateButtonReplyMessage", "selectedDisplayText"),
                        ("listResponseMessage", "title")):
        if isinstance(m.get(kind), dict):
            return first_text(m[kind].get(field)) or None
    if isinstance(m.get("interactiveResponseMessage"), dict):
        return first_text((m["interactiveResponseMessage"].get("body") or {}).get("text")) or None
    if isinstance(m.get("contactMessage"), dict):
        return "[联络人] " + first_text(m["contactMessage"].get("displayName"), "?")
    if isinstance(m.get("contactsArrayMessage"), dict):
        return "[联络人] " + first_text(m["contactsArrayMessage"].get("displayName"), "?")
    if isinstance(m.get("locationMessage"), dict):
        place = m["locationMessage"]
        return "[位置] " + first_text(place.get("name"), place.get("address"), "%s, %s" % (place.get("degreesLatitude"), place.get("degreesLongitude")))
    for kind in ("pollCreationMessage", "pollCreationMessageV2", "pollCreationMessageV3"):
        if isinstance(m.get(kind), dict):
            options = [first_text(option.get("optionName")) for option in m[kind].get("options") or [] if isinstance(option, dict)]
            return "[投票] " + first_text(m[kind].get("name"), "?") + ("\n- " + "\n- ".join(o for o in options if o) if options else "")
    if isinstance(m.get("groupInviteMessage"), dict):
        invite = m["groupInviteMessage"]
        return "[群组邀请] " + first_text(invite.get("groupName"), "?") + ("\n" + invite["caption"] if first_text(invite.get("caption")) else "")
    return None


def protocol_of(message):
    """('revoke' | 'edit', target id, new text or None) for a protocol message, else None."""
    p = unwrap(message).get("protocolMessage")
    if not isinstance(p, dict):
        return None
    target = (p.get("key") or {}).get("id")
    kind = str(p.get("type"))
    if not target:
        return None
    if kind in REVOKE:
        return "revoke", target, None
    if kind in EDIT:
        return "edit", target, text_of(p.get("editedMessage") or {})
    return None


# ---------- whose chat ----------

def digits(jid):
    return (jid or "").split("@", 1)[0].split(":", 1)[0]


def person_of(row, phones):
    """(identifier, phone) for the chat of a message row, or None for a group / status / channel.

    row: jid, alt (Evolution's remoteJidAlt). phones: hidden id -> phone digits, from the session's mapping files.
    """
    jid = row.get("jid") or ""
    if not jid or any(jid.endswith(end) for end in SKIP_CHATS) or jid == "status@broadcast":
        return None
    if jid.endswith("@lid"):
        alt = row.get("alt") or ""
        phone = digits(alt) if alt.endswith("@s.whatsapp.net") else phones.get(digits(jid))
        if phone:
            return f"{phone}@s.whatsapp.net", "+" + phone
        return jid, "+" + digits(jid)
    if jid.endswith("@s.whatsapp.net"):
        return jid, "+" + digits(jid)
    return None


def read_mapping(dirs):
    """hidden id -> phone digits, from Baileys' lid-mapping-<lid>_reverse.json files."""
    phones = {}
    pattern = re.compile(r"^lid-mapping-(\d+)_reverse\.json$")
    for folder in dirs:
        try:
            names = os.listdir(folder)
        except OSError:
            continue
        for name in names:
            match = pattern.match(name)
            if not match:
                continue
            try:
                with open(os.path.join(folder, name)) as handle:
                    value = json.load(handle)
            except (OSError, ValueError):
                continue
            phone = digits(str(value))
            if phone.isdigit() and 8 <= len(phone) <= 15:
                phones.setdefault(match.group(1), phone)
    return phones


def build_chats(rows, phones, known_ids):
    """Groups Evolution's message rows into chats to bring.

    rows: dicts id, jid, alt, fromMe, push, ts, msg, cw (Chatwoot message id when Evolution already sent it there).
    known_ids: WhatsApp ids already in the inbox. Returns {identifier: {"phone", "name", "messages": [...]}} where each
    message is {"id", "incoming", "ts", "text"}, oldest first, and a count of what was left out and why.
    """
    skipped = {"group or status": 0, "already in the inbox": 0, "not a message": 0, "taken back": 0, "repeated": 0}
    edits, revoked = {}, set()
    # A hidden id that some message of the same person names with its phone (remoteJidAlt) is that phone.
    phones = dict(phones)
    for row in rows:
        jid, alt = row.get("jid") or "", row.get("alt") or ""
        if jid.endswith("@lid") and alt.endswith("@s.whatsapp.net"):
            phones.setdefault(digits(jid), digits(alt))
    for row in rows:
        change = protocol_of(row.get("msg") or {})
        if change:
            kind, target, text = change
            if kind == "revoke":
                revoked.add(target)
            elif text:
                edits[target] = text
    chats, seen, linked = {}, set(), {}
    for row in sorted(rows, key=lambda r: (r.get("ts") or 0, r.get("id") or "")):
        who = person_of(row, phones)
        if who is None:
            skipped["group or status"] += 1
            continue
        wa_id = row.get("id")
        if not wa_id or wa_id in seen:
            skipped["repeated"] += 1
            continue
        seen.add(wa_id)
        if row.get("conv"):
            # Evolution put this person's message in that Chatwoot chat: the old messages go there too.
            linked[who[0]] = row["conv"]
        if row.get("cw") or wa_id in known_ids:
            skipped["already in the inbox"] += 1
            continue
        if wa_id in revoked:
            skipped["taken back"] += 1
            continue
        text = edits.get(wa_id) or text_of(row.get("msg") or {})
        if not text:
            skipped["not a message"] += 1
            continue
        identifier, phone = who
        chat = chats.setdefault(identifier, {"phone": phone, "name": "", "messages": [], "conversation": None})
        incoming = not row.get("fromMe")
        if incoming and first_text(row.get("push")):
            chat["name"] = row["push"].strip()
        # (the SQL body is dollar-quoted with $import$; a message holding those words must not end it)
        text = text[:20000].replace("$import$", "$ import$")
        chat["messages"].append({"id": wa_id, "incoming": incoming, "ts": int(row.get("ts") or 0), "text": text})
    for identifier, chat in chats.items():
        chat["conversation"] = linked.get(identifier)
    return chats, skipped


# ---------- writing ----------

def quote(value):
    return "'" + str(value).replace("\x00", "").replace("'", "''") + "'"


def stamp(seconds):
    moment = datetime.datetime.fromtimestamp(seconds, datetime.timezone.utc).replace(tzinfo=None)
    return quote(moment.isoformat(sep=" ", timespec="seconds"))


def chat_sql(identifier, chat, account, inbox, tag, live_after=None):
    """One transaction for one chat: its contact, its chat in the inbox, and its messages. It reports what it made in a
    NOTICE line (IMPORTED <json>) for the journal."""
    messages = chat["messages"]
    attributes = quote(json.dumps({"imported_history": tag}))
    name = chat["name"] or digits(identifier)
    first, last = messages[0]["ts"], messages[-1]["ts"]
    # Messages from live_after on came while the number was away: they are new news, not history. Their chat is
    # open and they stay unread; only what came before them is marked read.
    live = [m for m in messages if live_after is not None and m["ts"] >= live_after]
    earlier = [m for m in messages if m not in live]
    news = any(m["incoming"] for m in live)
    seen_until = stamp(earlier[-1]["ts"]) if earlier else None
    new_status = 0 if news else 1
    new_seen = stamp(live_after) if news else "now()"
    values = ",\n".join(
        "(%s, %d, %s, %s)" % (quote(m["text"]), 0 if m["incoming"] else 1, stamp(m["ts"]), quote("WAID:" + m["id"]))
        for m in messages
    )
    lid = identifier.endswith("@lid")
    return f"""
do $import$
declare
  cid bigint; ciid bigint; convid bigint; made_contact boolean := false; made_chat boolean := false; added integer;
begin
  -- The chat Evolution itself used for this person, when there is one in this inbox.
  select c.id, c.contact_id into convid, cid from conversations c
  where c.id = {int(chat.get("conversation") or 0)} and c.account_id = {account} and c.inbox_id = {inbox};
  if cid is null then
    select id into cid from contacts
    where account_id = {account} and (identifier = {quote(identifier)} or phone_number = {quote(chat["phone"])})
    order by (identifier = {quote(identifier)}) desc, id limit 1;
  end if;
  if cid is null then
    insert into contacts (name, phone_number, identifier, account_id, created_at, updated_at, last_activity_at,
                          additional_attributes, custom_attributes, contact_type)
    values ({quote(name)}, {quote(chat["phone"])}, {quote(identifier)}, {account}, now(), now(), {stamp(last)},
            {attributes}::jsonb, '{{}}'::jsonb, 1)
    returning id into cid;
    made_contact := true;
  end if;

  if convid is null then
    select c.id into convid from conversations c
    where c.account_id = {account} and c.inbox_id = {inbox} and c.contact_id = cid
    order by c.last_activity_at desc limit 1;
  end if;
  if convid is null then
    insert into contact_inboxes (contact_id, inbox_id, source_id, created_at, updated_at)
    values (cid, {inbox}, gen_random_uuid()::text, now(), now())
    returning id into ciid;
    insert into conversations (account_id, inbox_id, status, contact_id, contact_inbox_id, created_at, updated_at,
                               last_activity_at, agent_last_seen_at, contact_last_seen_at, additional_attributes, custom_attributes)
    values ({account}, {inbox}, {new_status}, cid, ciid, {stamp(first)}, now(), {stamp(last)}, {new_seen}, now(), {attributes}::jsonb, '{{}}'::jsonb)
    returning id into convid;
    made_chat := true;
  end if;

  insert into messages (content, account_id, inbox_id, conversation_id, message_type, created_at, updated_at, private,
                        status, source_id, content_type, content_attributes, sender_type, sender_id, processed_message_content)
  select v.text, {account}, {inbox}, convid, v.kind, v.at::timestamp, v.at::timestamp, false, 0, v.source_id, 0,
         to_json({attributes}::text), case when v.kind = 0 then 'Contact' end, case when v.kind = 0 then cid end, v.text
  from (values
{values}
  ) as v(text, kind, at, source_id)
  where not exists (select 1 from messages x where x.inbox_id = {inbox} and x.source_id = v.source_id);
  get diagnostics added = row_count;

  -- An old message never counts as unread; one that came after it still does.
  update conversations
  set agent_last_seen_at = {"greatest(coalesce(agent_last_seen_at, 'epoch'::timestamp), " + seen_until + ")" if seen_until else "agent_last_seen_at"},
      status = {"0" if news else "status"},
      last_activity_at = greatest(last_activity_at, {stamp(last)})
  where id = convid and not made_chat;

  raise notice 'IMPORTED %', json_build_object('identifier', {quote(identifier)}, 'contact', cid, 'made_contact', made_contact,
    'contact_inbox', ciid, 'chat', convid, 'made_chat', made_chat, 'added', added, 'lid', {str(lid).lower()});
end
$import$;
"""


def psql(service, database, sql):
    """Runs SQL in a database container; returns (stdout, stderr)."""
    done = subprocess.run(
        ["docker", "compose", "-p", COMPOSE_PROJECT, "exec", "-T", service, "psql", "-U", "postgres", "-d", database,
         "-v", "ON_ERROR_STOP=1", "-At"],
        input=sql, capture_output=True, text=True,
    )
    if done.returncode != 0:
        raise RuntimeError(done.stderr.strip()[:500])
    return done.stdout, done.stderr


def read_rows(service, instance):
    sql = (
        "select json_build_object('id', m.\"key\"->>'id', 'jid', m.\"key\"->>'remoteJid', 'alt', m.\"key\"->>'remoteJidAlt', "
        "'fromMe', (m.\"key\"->>'fromMe')::boolean, 'push', m.\"pushName\", 'ts', m.\"messageTimestamp\", "
        "'msg', m.\"message\", 'cw', m.\"chatwootMessageId\", 'conv', m.\"chatwootConversationId\") "
        "from \"Message\" m join \"Instance\" i on i.id = m.\"instanceId\" where i.name = %s;" % quote(instance)
    )
    out, _ = psql(service, "evolution", sql)
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def known_ids(service, inbox):
    out, _ = psql(service, "chatwoot", "select substr(source_id, 6) from messages where inbox_id = %d and source_id like 'WAID:%%';" % inbox)
    return set(out.split())


def preview(chats, service, account, inbox):
    """What the import would do with each chat: join a chat of this inbox, join a known contact, or make both.
    Also the new ones whose name is the name of someone with a chat in this inbox: maybe the same person under an id
    that could not be matched (they would get a second chat)."""
    out, _ = psql(service, "chatwoot",
        "select json_build_object('id', ct.id, 'identifier', ct.identifier, 'phone', ct.phone_number, 'name', ct.name, "
        "'here', exists (select 1 from conversations c where c.contact_id = ct.id and c.inbox_id = %d)) "
        "from contacts ct where ct.account_id = %d;" % (inbox, account))
    out_chats, _ = psql(service, "chatwoot", "select id from conversations where account_id = %d and inbox_id = %d;" % (account, inbox))
    chats_here = {int(x) for x in out_chats.split()}
    by_identifier, by_phone, names_here = {}, {}, {}
    for line in out.splitlines():
        contact = json.loads(line)
        if contact["identifier"]:
            by_identifier[contact["identifier"]] = contact
        if contact["phone"]:
            by_phone.setdefault(contact["phone"], contact)
        if contact["here"] and contact["name"]:
            names_here.setdefault(contact["name"].strip().lower(), contact)
    counts = {"join the chat Evolution used": 0, "join a chat in this inbox": 0, "known contact, new chat": 0, "new contact and chat": 0}
    maybe_same = []
    for identifier, chat in chats.items():
        contact = by_identifier.get(identifier) or by_phone.get(chat["phone"])
        if chat.get("conversation") in chats_here:
            counts["join the chat Evolution used"] += 1
        elif contact and contact["here"]:
            counts["join a chat in this inbox"] += 1
        elif contact:
            counts["known contact, new chat"] += 1
        else:
            counts["new contact and chat"] += 1
            twin = names_here.get((chat["name"] or "").strip().lower())
            if twin and not (chat["name"] or "").strip().isdigit():
                maybe_same.append((identifier, twin["identifier"], len(chat["messages"])))
    return counts, maybe_same


def rollback(args):
    tag_json = json.dumps({"imported_history": args.tag})
    made = []
    if os.path.exists(args.journal):
        made = [json.loads(line) for line in open(args.journal) if line.strip()]
    chats = [m["chat"] for m in made if m.get("made_chat")]
    contacts = [m["contact"] for m in made if m.get("made_contact")]
    contact_inboxes = [m["contact_inbox"] for m in made if m.get("made_chat") and m.get("contact_inbox")]
    statements = ["begin;",
                  "delete from messages where inbox_id = %d and content_attributes::text = to_json(%s::text)::text;" % (args.inbox, quote(tag_json))]
    if chats:
        ids = ",".join(str(int(c)) for c in chats)
        # A chat it made goes only if nothing else was written in it since.
        statements.append("delete from conversations c where c.id in (%s) and not exists (select 1 from messages m where m.conversation_id = c.id);" % ids)
    if contact_inboxes:
        ids = ",".join(str(int(c)) for c in contact_inboxes)
        statements.append("delete from contact_inboxes ci where ci.id in (%s) and not exists (select 1 from conversations c where c.contact_inbox_id = ci.id);" % ids)
    if contacts:
        ids = ",".join(str(int(c)) for c in contacts)
        statements.append("delete from contacts ct where ct.id in (%s) and not exists (select 1 from conversations c where c.contact_id = ct.id);" % ids)
    statements.append("commit;")
    out, err = psql(args.cw_service, "chatwoot", "\n".join(statements))
    log("rollback:", " ".join((out + err).split()))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--instance", required=True)
    parser.add_argument("--inbox", type=int, required=True)
    parser.add_argument("--account", type=int, required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--evo-service", default="evo-eduhero-postgres")
    parser.add_argument("--cw-service", default="cw-postgres")
    parser.add_argument("--mapping-dir", action="append", default=[])
    parser.add_argument("--journal", default="")
    parser.add_argument("--only", default="", help="comma list of chat identifiers (as the dry run prints them)")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rollback", action="store_true")
    parser.add_argument("--show", type=int, default=10)
    parser.add_argument("--live-after", default="", help="ISO time: messages from then on are new (chat open, unread)")
    args = parser.parse_args()
    args.journal = args.journal or f"import-history-{args.tag}.jsonl"
    live_after = int(datetime.datetime.fromisoformat(args.live_after).timestamp()) if args.live_after else None

    if args.rollback:
        return rollback(args)

    rows = read_rows(args.evo_service, args.instance)
    phones = read_mapping(args.mapping_dir)
    already = known_ids(args.cw_service, args.inbox)
    chats, skipped = build_chats(rows, phones, already)
    if args.only:
        wanted = {item.strip() for item in args.only.split(",") if item.strip()}
        chats = {k: v for k, v in chats.items() if k in wanted}
    total = sum(len(c["messages"]) for c in chats.values())
    by_size = sorted(chats.items(), key=lambda item: -len(item[1]["messages"]))
    log(f"Evolution rows: {len(rows)} | hidden ids with a known phone: {len(phones)} | already in inbox {args.inbox}: {len(already)}")
    log(f"to bring: {len(chats)} chats, {total} messages "
        f"(from parents {sum(m['incoming'] for c in chats.values() for m in c['messages'])}, "
        f"placeholders {sum(m['text'].startswith(PLACEHOLDER) for c in chats.values() for m in c['messages'])}); "
        f"hidden-id chats without a phone: {sum(k.endswith('@lid') for k in chats)}")
    log("left out:", skipped)
    if live_after is not None:
        live = [(k, m) for k, c in chats.items() for m in c["messages"] if m["ts"] >= live_after]
        log(f"came after {args.live_after} (kept unread, chat open if a parent wrote): {len(live)} messages in "
            f"{len({k for k, _ in live})} chats, from parents {sum(m['incoming'] for _, m in live)}")
    for identifier, chat in by_size[: args.show]:
        log(f"  {identifier:32s} {len(chat['messages']):5d} msgs  "
            f"{datetime.datetime.fromtimestamp(chat['messages'][0]['ts']):%Y-%m-%d} .. {datetime.datetime.fromtimestamp(chat['messages'][-1]['ts']):%Y-%m-%d}")
    if not args.apply:
        counts, maybe_same = preview(chats, args.cw_service, args.account, args.inbox)
        log("would:", counts)
        log(f"new chats whose name is someone's with a chat in this inbox (maybe the same person): {len(maybe_same)}")
        for identifier, other, size in maybe_same[: args.show]:
            log(f"  {identifier} ({size} msgs)  ~  {other}")
        log("Dry run: nothing written.")
        return

    started = time.time()
    written = made_chats = made_contacts = 0
    with open(args.journal, "a") as journal:
        for number, (identifier, chat) in enumerate(by_size, 1):
            out, err = psql(args.cw_service, "chatwoot", chat_sql(identifier, chat, args.account, args.inbox, args.tag, live_after))
            for line in (out + "\n" + err).splitlines():
                if "IMPORTED " in line:
                    record = json.loads(line.split("IMPORTED ", 1)[1])
                    journal.write(json.dumps(record) + "\n")
                    journal.flush()
                    written += record["added"] or 0
                    made_chats += bool(record["made_chat"])
                    made_contacts += bool(record["made_contact"])
            if number % 100 == 0:
                log(f"  {number}/{len(by_size)} chats, {written} messages so far")
    log(f"Done in {time.time() - started:.0f} s: {written} messages into {len(by_size)} chats "
        f"({made_chats} chats and {made_contacts} contacts made). Journal: {args.journal}")


if __name__ == "__main__":
    sys.exit(main())
