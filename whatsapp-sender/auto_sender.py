#!/usr/bin/env python3
"""Sends the automation messages of the flows that are switched to "send by itself".

Runs on the WhatsApp server next to Chatwoot. It does no deciding: it asks the CRM database (through
the edge function auto-sender) for the next message that is allowed to go out, sends it into the
parent's existing chat through the local Chatwoot, and reports what happened.

A WhatsApp message is found by the parent's phone number. A Messenger / Instagram message has no number: the
queue names the chat (conversation_id) and it goes straight into that chat (through the GoHighLevel bridge
or the Facebook channel of Chatwoot). A queue row of kind "ghl_workflow" does not send text: it starts a
GoHighLevel workflow for that chat's contact (the workflow holds the buttons), which needs GHL_TOKEN.

With OPEN_NEW_CHATS=1, a WhatsApp message to a number that has not written yet opens the chat itself (a
contact and a conversation in the WhatsApp inbox) and sends the same message. Without it, such a message is
handed back to the approval queue for a person to look at. Messenger / Instagram cannot be started either
way: those only go into a chat the person began.

Settings (environment, from /opt/mirai-inbox/auto-sender.env):
  SENDER_URL     https://<project>.supabase.co/functions/v1/auto-sender
  SENDER_KEY     the key kept in the database (automation_sender)
  CHATWOOT_URL   default http://127.0.0.1:3000
  CHATWOOT_TOKEN an agent token of the Chatwoot account
  CHATWOOT_ACCOUNT default 1
  GHL_TOKEN      optional, a GoHighLevel Private Integration token (scopes: contacts.write); only for button
                 messages (queue kind "ghl_workflow")
  GHL_API_URL    default https://services.leadconnectorhq.com
  OPEN_NEW_CHATS 1 lets it start a chat with a number that has not written to the school; default 0
  WHATSAPP_INBOX_IDS optional, e.g. "3,6": the Chatwoot inboxes that are WhatsApp numbers. A WhatsApp message then
                 only goes into a chat of these inboxes (the parent's latest one), and a new chat is made in the
                 first. "auto": every inbox whose webhook is an Evolution number (looked up every 10 minutes, so
                 a number added from the CRM counts by itself; Messenger / Instagram inboxes do not). Unset: any
                 inbox, as before (an account with one WhatsApp number needs nothing)

How often it asks: every question leaves lines in the CRM database's logs, so it asks only when it can be
useful. The database says how long to wait (wait_seconds): until the sending hours open, until the 30-second
gap after the last message has passed, a few minutes while sending is paused, and a minute when nothing is
waiting. A message that is due goes out within that minute.

Message texts are never written to the log.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

SENDER_URL = os.environ["SENDER_URL"]
SENDER_KEY = os.environ["SENDER_KEY"]
CHATWOOT_URL = os.environ.get("CHATWOOT_URL", "http://127.0.0.1:3000").rstrip("/")
CHATWOOT_TOKEN = os.environ["CHATWOOT_TOKEN"]
ACCOUNT = os.environ.get("CHATWOOT_ACCOUNT", "1")
GHL_TOKEN = os.environ.get("GHL_TOKEN", "")
GHL_API_URL = os.environ.get("GHL_API_URL", "https://services.leadconnectorhq.com").rstrip("/")
GHL_PREFIX = "ghl:"
OPEN_NEW_CHATS = os.environ.get("OPEN_NEW_CHATS", "0") == "1"
WHATSAPP_INBOX_SETTING = os.environ.get("WHATSAPP_INBOX_IDS", "").strip()
WHATSAPP_INBOX_IDS = [int(part) for part in WHATSAPP_INBOX_SETTING.split(",") if part.strip().isdigit()]
FIND_INBOXES = WHATSAPP_INBOX_SETTING.lower() == "auto"
FIND_INBOXES_SECONDS = 600
EVOLUTION_WEBHOOK = "/chatwoot/webhook/"
_found_inboxes = {"at": 0.0, "ids": []}

# The database's wait is kept between these, so a wrong answer can neither spin nor stop the sender.
MIN_WAIT_SECONDS = 2
MAX_WAIT_SECONDS = 30 * 60
# When the function gives no wait (an older auto-sender): once a minute, and every 15 seconds for two minutes
# after a message went out, so a row of messages still goes at the 30-second gap.
IDLE_SECONDS = 60
BUSY_SECONDS = 15
BUSY_WINDOW_SECONDS = 120
ERROR_SECONDS = 60
CONFIRM_SECONDS = 45
API = f"{CHATWOOT_URL}/api/v1/accounts/{ACCOUNT}"

# Chatwoot's message_type for something the person wrote.
INCOMING = 0


def log(text):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), text, flush=True)


def http(method, url, headers, body=None, timeout=25):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode()
        return json.loads(raw) if raw else {}


def crm(body):
    return http(
        "POST",
        SENDER_URL,
        {"Content-Type": "application/json", "x-sender-key": SENDER_KEY},
        body,
    )


def chatwoot(method, path, body=None):
    return http(
        method,
        f"{API}{path}",
        {"api_access_token": CHATWOOT_TOKEN, "Content-Type": "application/json"},
        body,
    )


MAX_PICTURE_BYTES = 6 * 1024 * 1024


def fetch_picture(url):
    """Downloads a message picture. Only from the CRM's own storage (the host of SENDER_URL)."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != urllib.parse.urlparse(SENDER_URL).hostname:
        raise ValueError("picture is not from the CRM storage")
    request = urllib.request.Request(url, headers={"User-Agent": "mirai-auto-sender"})
    with urllib.request.urlopen(request, timeout=25) as response:
        data = response.read(MAX_PICTURE_BYTES + 1)
        kind = response.headers.get_content_type() or "image/jpeg"
    if len(data) > MAX_PICTURE_BYTES:
        raise ValueError("picture is too large")
    name = os.path.basename(parsed.path) or "picture"
    return name, kind, data


def post_with_picture(path, fields, picture):
    """POST multipart/form-data to Chatwoot: the text fields and one attachment."""
    name, kind, data = picture
    boundary = "----mirai" + os.urandom(8).hex()
    crlf = bytes([13, 10])
    body = b""
    for key, value in fields.items():
        body += f"--{boundary}".encode() + crlf
        body += f'Content-Disposition: form-data; name="{key}"'.encode() + crlf + crlf
        body += str(value).encode() + crlf
    body += f"--{boundary}".encode() + crlf
    body += f'Content-Disposition: form-data; name="attachments[]"; filename="{name}"'.encode() + crlf
    body += f"Content-Type: {kind}".encode() + crlf + crlf
    body += data + crlf
    body += f"--{boundary}--".encode() + crlf
    request = urllib.request.Request(
        f"{API}{path}",
        data=body,
        method="POST",
        headers={"api_access_token": CHATWOOT_TOKEN, "Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read().decode()
        return json.loads(raw) if raw else {}


def digits_of(value):
    return "".join(ch for ch in (value or "") if ch.isdigit())


def find_contact(phone):
    found = chatwoot("GET", "/contacts/search?q=" + urllib.parse.quote(phone))
    for contact in found.get("payload", []):
        if digits_of(contact.get("phone_number")) == phone:
            return contact["id"]
        if (contact.get("identifier") or "").startswith(phone + "@"):
            return contact["id"]
    return None


def person_has_written(conversation_id):
    """True when the chat holds at least one message the person sent (looks back up to 4 pages)."""
    before = None
    for _ in range(4):
        path = f"/conversations/{conversation_id}/messages"
        if before:
            path += f"?before={before}"
        messages = chatwoot("GET", path).get("payload", [])
        if not messages:
            return False
        if any(message.get("message_type") == INCOMING for message in messages):
            return True
        before = min(message["id"] for message in messages)
    return False


def whatsapp_inbox_ids():
    """The WhatsApp numbers' inboxes (oldest first), or [] for any inbox."""
    if not FIND_INBOXES:
        return WHATSAPP_INBOX_IDS
    if time.time() - _found_inboxes["at"] > FIND_INBOXES_SECONDS or not _found_inboxes["ids"]:
        inboxes = chatwoot("GET", "/inboxes").get("payload", [])
        found = sorted(
            inbox["id"]
            for inbox in inboxes
            if EVOLUTION_WEBHOOK in (inbox.get("webhook_url") or "").split("?", 1)[0]
        )
        if not found:
            raise RuntimeError("no WhatsApp inbox found")
        _found_inboxes.update(at=time.time(), ids=found)
    return _found_inboxes["ids"]


def pick_conversation(contact_id):
    """The latest chat of this contact in which the person has written, or None. With several WhatsApp numbers,
    only their chats count: the message goes from the number the parent last wrote to."""
    conversations = chatwoot("GET", f"/contacts/{contact_id}/conversations").get("payload", [])
    wanted = whatsapp_inbox_ids()
    if wanted:
        conversations = [item for item in conversations if item.get("inbox_id") in wanted]
    for conversation in sorted(conversations, key=lambda item: item["id"], reverse=True):
        if person_has_written(conversation["id"]):
            return conversation
    return None


def whatsapp_inbox_id():
    """The inbox new WhatsApp chats are made in (the first API channel, as the CRM's New chat does)."""
    inboxes = chatwoot("GET", "/inboxes").get("payload", [])
    wanted = whatsapp_inbox_ids()
    if wanted:
        listed = [inbox for inbox in inboxes if inbox.get("id") in wanted]
        listed.sort(key=lambda inbox: wanted.index(inbox["id"]))
        if not listed:
            raise RuntimeError("none of WHATSAPP_INBOX_IDS is an inbox of this account")
        return listed[0]["id"]
    api = [inbox for inbox in inboxes if inbox.get("channel_type") == "Channel::Api"]
    chosen = (api or inboxes or [None])[0]
    if not chosen:
        raise RuntimeError("no WhatsApp inbox")
    return chosen["id"]


def create_contact(inbox_id, phone, name):
    created = chatwoot(
        "POST",
        "/contacts",
        {
            "inbox_id": inbox_id,
            "name": name or f"+{phone}",
            "phone_number": f"+{phone}",
            "identifier": f"{phone}@s.whatsapp.net",
        },
    )
    payload = created.get("payload", {})
    contact_id = (payload.get("contact") or {}).get("id") or payload.get("id")
    if not contact_id:
        raise RuntimeError("contact was not created")
    return contact_id


def open_chat(phone, name):
    """The chat to write into for a number: the one the person wrote in, else any chat of theirs in the
    WhatsApp inbox, else a new one (and a new contact when the number is unknown). Returns (conversation, is_new);
    the conversation is None when the person has not written and OPEN_NEW_CHATS is off."""
    contact_id = find_contact(phone)
    if contact_id is not None:
        written = pick_conversation(contact_id)
        if written is not None:
            return written, False
    if not OPEN_NEW_CHATS:
        return None, False
    inbox_id = whatsapp_inbox_id()
    if contact_id is None:
        contact_id = create_contact(inbox_id, phone, name)
    existing = [
        conversation
        for conversation in chatwoot("GET", f"/contacts/{contact_id}/conversations").get("payload", [])
        if conversation.get("inbox_id") == inbox_id
    ]
    if existing:
        existing.sort(key=lambda conversation: conversation["id"], reverse=True)
        return existing[0], False
    return chatwoot("POST", "/conversations", {"contact_id": contact_id, "inbox_id": inbox_id}), True


def wait_until_accepted(conversation_id, message_id, quiet_is_sent=False):
    """WhatsApp gives the message an id once it took it. Messenger / Instagram through GoHighLevel do not
    always: there, a message that has not failed after a few seconds counts as sent."""
    started = time.time()
    deadline = started + CONFIRM_SECONDS
    while time.time() < deadline:
        time.sleep(2)
        for message in chatwoot("GET", f"/conversations/{conversation_id}/messages").get("payload", []):
            if message.get("id") != message_id:
                continue
            if message.get("status") == "failed":
                return "failed"
            if message.get("source_id"):
                return "sent"
            if quiet_is_sent and time.time() - started >= 12:
                return "sent"
    return "timeout"


def ghl_post(path, body):
    request = urllib.request.Request(
        GHL_API_URL + path,
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {GHL_TOKEN}",
            "Version": "2021-07-28",
            "Content-Type": "application/json",
            "Accept": "application/json",
            # GoHighLevel sits behind Cloudflare, which answers 403 to Python's own default User-Agent.
            "User-Agent": "Mozilla/5.0 (compatible; MiraiCrmAutoSender/1.0)",
        },
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.status


def send_to_chat(item):
    """A Messenger / Instagram message (or a GoHighLevel button workflow): the queue names the chat."""
    conversation = chatwoot("GET", f"/conversations/{int(item['conversation_id'])}")
    if not conversation or not conversation.get("id"):
        return "blocked", "The chat was not found."
    if not person_has_written(conversation["id"]):
        return "blocked", "Has not written to us first."
    sender = (conversation.get("meta") or {}).get("sender") or {}
    identifier = sender.get("identifier") or ""

    if item.get("kind") == "ghl_workflow":
        if not GHL_TOKEN:
            return "failed", "The sender has no GoHighLevel key, so it cannot start a button message."
        if not identifier.startswith(GHL_PREFIX):
            return "blocked", "This chat does not come from GoHighLevel, so a GoHighLevel workflow cannot start for it."
        try:
            ghl_post(f"/contacts/{identifier[len(GHL_PREFIX):]}/workflow/{item['workflow_id']}", {})
        except urllib.error.HTTPError as problem:
            return "failed", f"GoHighLevel refused to start the workflow (HTTP {problem.code})."
        # A private note, so the team can see in the chat that a button message went out.
        chatwoot(
            "POST",
            f"/conversations/{conversation['id']}/messages",
            {"content": "Automation started a button message (GoHighLevel workflow).", "private": True, "message_type": "outgoing"},
        )
        return "sent", None

    if conversation.get("status") == "resolved":
        chatwoot("POST", f"/conversations/{conversation['id']}/toggle_status", {"status": "open"})
    if item.get("media_url"):
        try:
            picture = fetch_picture(item["media_url"])
        except Exception as problem:
            return "failed", f"The picture could not be loaded ({type(problem).__name__})."
        sent = post_with_picture(
            f"/conversations/{conversation['id']}/messages",
            {
                "content": item["message"],
                "private": "false",
                "message_type": "outgoing",
                "content_attributes[crm_sender][id]": "0",
                "content_attributes[crm_sender][name]": "Automation",
            },
            picture,
        )
    else:
        sent = chatwoot(
            "POST",
            f"/conversations/{conversation['id']}/messages",
            {
                "content": item["message"],
                "private": False,
                "message_type": "outgoing",
                "content_attributes": {"crm_sender": {"id": 0, "name": "Automation"}},
            },
        )
    outcome = wait_until_accepted(conversation["id"], sent["id"], quiet_is_sent=True)
    if outcome == "sent":
        return "sent", None
    if outcome == "failed":
        return "failed", "The channel did not accept the message."
    return "failed", "The channel did not confirm the message in time. Check the chat before sending again."


def send(item):
    """Returns (result, error): result is sent, failed or blocked."""
    if item.get("conversation_id"):
        return send_to_chat(item)
    phone = digits_of(item["phone"])
    conversation, is_new = open_chat(phone, item.get("parent_name") or "")
    if conversation is None:
        return "blocked", "Has not written to us first."
    if is_new:
        log(f"message {item['id']}: opened a new chat for it")
    if conversation.get("status") == "resolved":
        chatwoot("POST", f"/conversations/{conversation['id']}/toggle_status", {"status": "open"})
    if item.get("media_url"):
        # The text goes as the caption of the picture.
        try:
            picture = fetch_picture(item["media_url"])
        except Exception as problem:
            return "failed", f"The picture could not be loaded ({type(problem).__name__})."
        sent = post_with_picture(
            f"/conversations/{conversation['id']}/messages",
            {
                "content": item["message"],
                "private": "false",
                "message_type": "outgoing",
                "content_attributes[crm_sender][id]": "0",
                "content_attributes[crm_sender][name]": "Automation",
            },
            picture,
        )
    else:
        sent = chatwoot(
            "POST",
            f"/conversations/{conversation['id']}/messages",
            {
                "content": item["message"],
                "private": False,
                "message_type": "outgoing",
                "content_attributes": {"crm_sender": {"id": 0, "name": "Automation"}},
            },
        )
    outcome = wait_until_accepted(conversation["id"], sent["id"])
    if outcome == "sent":
        return "sent", None
    if outcome == "failed":
        return "failed", "WhatsApp did not accept the message."
    # No answer in time: it may still go out, so a person checks the chat instead of it being retried.
    return "failed", "WhatsApp did not confirm the message in time. Check the chat before sending again."


def wait_after(answer, since_sent):
    """Seconds to wait before asking again when no message came. since_sent: seconds since this sender last
    sent one, or None."""
    wait = answer.get("wait_seconds")
    if isinstance(wait, (int, float)) and not isinstance(wait, bool) and wait > 0:
        return max(MIN_WAIT_SECONDS, min(MAX_WAIT_SECONDS, wait))
    if since_sent is not None and since_sent < BUSY_WINDOW_SECONDS:
        return BUSY_SECONDS
    return IDLE_SECONDS


def main():
    log("auto-sender started")
    last_sent = None
    last_reason = None
    while True:
        try:
            answer = crm({"action": "claim"})
        except urllib.error.HTTPError as problem:
            log(f"claim refused: HTTP {problem.code}")
            time.sleep(ERROR_SECONDS)
            continue
        except Exception as problem:  # network down, DNS, timeout
            log(f"claim failed: {type(problem).__name__}")
            time.sleep(ERROR_SECONDS)
            continue

        item = answer.get("message")
        if not item:
            wait = wait_after(answer, None if last_sent is None else time.time() - last_sent)
            reason = answer.get("reason")
            # Only a change is logged ("closed" once in the evening, not every half hour).
            if reason != last_reason:
                log(f"nothing to send ({reason or 'no reason given'}), next look in {round(wait)} s")
                last_reason = reason
            time.sleep(wait)
            continue
        last_reason = None

        try:
            result, error = send(item)
        except Exception as problem:
            result, error = "failed", f"The sender could not reach WhatsApp ({type(problem).__name__})."
        log(f"message {item['id']} -> {result}" + (f" ({error})" if error else ""))
        last_sent = time.time()
        try:
            crm({"action": "finish", "id": item["id"], "result": result, "error": error})
        except Exception as problem:
            # The database marks it failed on its own after 10 minutes; it is never sent twice.
            log(f"could not report message {item['id']}: {type(problem).__name__}")
        time.sleep(2)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
