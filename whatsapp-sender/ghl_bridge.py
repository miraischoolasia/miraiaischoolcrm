"""Two-way bridge between GoHighLevel (Facebook Messenger / Instagram) and the CRM inbox (Chatwoot).

GoHighLevel already holds the school's Facebook Page connection (a Meta-approved app). This service
puts those chats in the same inbox as WhatsApp:

  GHL workflow "Customer Replied" -> webhook -> POST /ghl/in?key=...   a message is added to a Chatwoot
                                                                       conversation of the "Messenger (GHL)"
                                                                       inbox (made when it does not exist)
  a staff reply in the CRM        -> Chatwoot webhook -> POST /ghl/out?key=...   sent to the person through
                                                                       the GoHighLevel API

Nothing is kept here: the chat itself lives in Chatwoot, and the person is found again by the
identifier "ghl:<GoHighLevel contact id>" on the Chatwoot contact.

Settings (environment, from ghl-bridge.env):
  BRIDGE_KEY        the secret in the address GoHighLevel and Chatwoot call (?key=...)
  CHATWOOT_URL      http://chatwoot-rails:3000
  CHATWOOT_TOKEN    an agent/admin token of Chatwoot
  ACCOUNT_ID        1
  INBOX_ID          the Chatwoot "API" inbox that holds these chats
  GHL_TOKEN         a GoHighLevel Private Integration token (scope: conversations/message.write); empty = replies
                    from the CRM are refused with a clear note instead of being lost
  GHL_API_URL       https://services.leadconnectorhq.com   (default)
  PAGE_INBOXES      optional, "<facebook page id>:<inbox id>,..." - a chat of that Page goes to that inbox, so two
                    Pages of one GoHighLevel account show as two Messengers in the CRM. A chat of any other Page
                    goes to INBOX_ID. The Page of a chat is read from GoHighLevel (meta.fb.pageId of its messages).
"""

import hmac
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BRIDGE_KEY = os.environ.get("BRIDGE_KEY", "")
CHATWOOT_URL = os.environ.get("CHATWOOT_URL", "http://chatwoot-rails:3000").rstrip("/")
CHATWOOT_TOKEN = os.environ.get("CHATWOOT_TOKEN", "")
ACCOUNT_ID = os.environ.get("ACCOUNT_ID", "1")
INBOX_ID = int(os.environ.get("INBOX_ID", "0") or 0)
GHL_TOKEN = os.environ.get("GHL_TOKEN", "")
GHL_API_URL = os.environ.get("GHL_API_URL", "https://services.leadconnectorhq.com").rstrip("/")
PORT = int(os.environ.get("PORT", "9100"))


def _read_page_inboxes(text):
    found = {}
    for part in text.split(","):
        page, _, inbox = part.strip().partition(":")
        if page.isdigit() and inbox.isdigit():
            found[page] = int(inbox)
    return found


PAGE_INBOXES = _read_page_inboxes(os.environ.get("PAGE_INBOXES", ""))

IDENTIFIER_PREFIX = "ghl:"
MAX_TEXT = 4000

_lock = threading.Lock()
_seen: dict[str, float] = {}


def log(*parts):
    print(time.strftime("%H:%M:%S"), *parts, flush=True)


def chatwoot(method, path, body=None):
    request = urllib.request.Request(
        f"{CHATWOOT_URL}/api/v1/accounts/{ACCOUNT_ID}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"api_access_token": CHATWOOT_TOKEN, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def first_text(*values):
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def read_inbound(payload):
    """What matters in a GoHighLevel webhook, whichever shape it has.

    The workflow is meant to send contact_id, name, text and channel (custom data), but GoHighLevel's own
    default payload is read as well: contact_id / contactId, full_name, message.body ...
    """
    message = payload.get("message") if isinstance(payload.get("message"), dict) else {}
    contact_id = first_text(
        payload.get("contact_id"), payload.get("contactId"), (payload.get("contact") or {}).get("id") if isinstance(payload.get("contact"), dict) else "", payload.get("id")
    )
    name = first_text(
        payload.get("name"), payload.get("full_name"), payload.get("contact_name"),
        " ".join(x for x in (payload.get("first_name"), payload.get("last_name")) if isinstance(x, str)).strip(),
    )
    text = first_text(
        payload.get("text"), message.get("body"), payload.get("body"),
        payload.get("message") if isinstance(payload.get("message"), str) else "",
    )
    raw_channel = first_text(
        payload.get("channel"), payload.get("message_type"), message.get("type"), payload.get("type"),
        str(message.get("type") or ""),
    ).lower()
    # GoHighLevel's own message types: 11 Facebook, 18 Instagram (also written TYPE_FACEBOOK / TYPE_INSTAGRAM).
    channel = "IG" if "insta" in raw_channel or raw_channel in ("ig", "18") else "FB"
    attachments = payload.get("attachments") or message.get("attachments") or []
    if isinstance(attachments, str):
        attachments = [attachments]
    urls = [a for a in attachments if isinstance(a, str) and a.startswith("http")]
    message_id = first_text(payload.get("message_id"), payload.get("messageId"), message.get("id"))
    return {
        "contact_id": contact_id,
        "name": name,
        "text": text[:MAX_TEXT],
        "channel": channel,
        "attachments": urls[:5],
        "message_id": message_id,
    }


def find_contact(contact_id):
    identifier = IDENTIFIER_PREFIX + contact_id
    data = chatwoot("GET", "/contacts/search?q=" + urllib.parse.quote(identifier))
    for contact in (data or {}).get("payload", []):
        if contact.get("identifier") == identifier:
            return contact
    return None


def conversation_for(contact, inbox_id):
    conversations = chatwoot("GET", f"/contacts/{contact['id']}/conversations").get("payload", [])
    ours = sorted((c for c in conversations if c.get("inbox_id") == inbox_id), key=lambda c: c["id"], reverse=True)
    for conversation in ours:
        if conversation.get("status") != "resolved":
            return conversation["id"]
    if ours:
        chatwoot("POST", f"/conversations/{ours[0]['id']}/toggle_status", {"status": "open"})
        return ours[0]["id"]
    created = chatwoot("POST", "/conversations", {"contact_id": contact["id"], "inbox_id": inbox_id})
    return created["id"]


def ghl_get(path, version="2021-04-15"):
    request = urllib.request.Request(
        GHL_API_URL + path,
        headers={
            "Authorization": f"Bearer {GHL_TOKEN}",
            "Version": version,
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; MiraiCrmGhlBridge/1.0)",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode())


_pages: dict[str, tuple[str, str]] = {}
_location_id = ""


def page_of(contact_id):
    """The Facebook Page (id, name) a GoHighLevel contact writes to, read from the meta.fb of its messages.

    A contact belongs to one Page, so the answer is remembered. Empty strings when it cannot be told (an
    Instagram chat, GoHighLevel not answering): the chat then goes to the default inbox.
    """
    global _location_id
    if contact_id in _pages:
        return _pages[contact_id]
    if not GHL_TOKEN:
        return "", ""
    try:
        if not _location_id:
            _location_id = (ghl_get(f"/contacts/{contact_id}", "2021-07-28").get("contact") or {}).get("locationId") or ""
        if not _location_id:
            return "", ""
        found = ghl_get(
            "/conversations/search?" + urllib.parse.urlencode({"locationId": _location_id, "contactId": contact_id})
        ).get("conversations") or []
        if not found:
            return "", ""
        data = ghl_get(f"/conversations/{found[0]['id']}/messages?limit=10")
        for message in ((data.get("messages") or {}).get("messages") or []):
            fb = (message.get("meta") or {}).get("fb") or {}
            page_id = str(fb.get("pageId") or "")
            if page_id:
                _pages[contact_id] = (page_id, str(fb.get("pageName") or ""))
                return _pages[contact_id]
    except Exception as error:  # noqa: BLE001 - the chat must arrive even when the Page cannot be told
        log("Could not tell the Page of a contact:", type(error).__name__)
    return "", ""


def handle_inbound(payload):
    info = read_inbound(payload)
    if not info["contact_id"] or not re.fullmatch(r"[A-Za-z0-9_-]{4,64}", info["contact_id"]):
        return 400, {"ok": False, "error": "no contact id"}
    if not info["text"] and not info["attachments"]:
        return 200, {"ok": True, "ignored": "empty message"}
    if info["message_id"]:
        with _lock:
            now = time.time()
            for key in [k for k, at in _seen.items() if now - at > 3600]:
                del _seen[key]
            if info["message_id"] in _seen:
                return 200, {"ok": True, "ignored": "already received"}
            _seen[info["message_id"]] = now

    contact = find_contact(info["contact_id"])
    attributes = {"ghl_contact_id": info["contact_id"], "ghl_channel": info["channel"]}
    # Two Pages of one GoHighLevel account are two Messengers in the CRM: each goes to its own inbox.
    page_id, page_name = page_of(info["contact_id"]) if info["channel"] == "FB" else ("", "")
    inbox_id = PAGE_INBOXES.get(page_id, INBOX_ID)
    if page_id:
        attributes["ghl_page_id"] = page_id
        attributes["ghl_page_name"] = page_name
    if contact is None:
        created = chatwoot(
            "POST",
            "/contacts",
            {
                "inbox_id": inbox_id,
                "name": info["name"] or "Messenger user",
                "identifier": IDENTIFIER_PREFIX + info["contact_id"],
                "additional_attributes": attributes,
            },
        )
        contact = (created or {}).get("payload", {}).get("contact") or created
    else:
        merged = {**(contact.get("additional_attributes") or {}), **attributes}
        if merged != (contact.get("additional_attributes") or {}):
            chatwoot("PUT", f"/contacts/{contact['id']}", {"additional_attributes": merged})
    conversation_id = conversation_for(contact, inbox_id)

    text = info["text"] or "[attachment]"
    if info["attachments"]:
        text = (info["text"] + "\n" if info["text"] else "") + "\n".join(info["attachments"])
    chatwoot("POST", f"/conversations/{conversation_id}/messages", {"content": text, "message_type": "incoming"})
    return 200, {"ok": True, "conversation_id": conversation_id}


def ghl_send(contact_id, channel, text, attachments):
    if not GHL_TOKEN:
        raise RuntimeError("GHL_TOKEN is not set, so a reply cannot be sent through GoHighLevel yet")
    body = {"type": channel, "contactId": contact_id, "message": text}
    if attachments:
        body["attachments"] = attachments
    request = urllib.request.Request(
        f"{GHL_API_URL}/conversations/messages",
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {GHL_TOKEN}",
            "Version": "2021-04-15",
            "Content-Type": "application/json",
            "Accept": "application/json",
            # GoHighLevel sits behind Cloudflare, which answers 403 to Python's own default User-Agent.
            "User-Agent": "Mozilla/5.0 (compatible; MiraiCrmGhlBridge/1.0)",
        },
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.status


def flag_failed(payload, reason):
    """The reply did not go out: mark the message failed (the CRM shows it) and leave a note that says why."""
    conversation_id = (payload.get("conversation") or {}).get("id")
    message_id = payload.get("id")
    if not conversation_id:
        return
    reason = reason[:200]
    try:
        if message_id:
            chatwoot("PATCH", f"/conversations/{conversation_id}/messages/{message_id}", {"status": "failed", "external_error": reason})
    except Exception as error:  # noqa: BLE001 - best effort, the note below still tells the team
        log("Could not mark the message failed:", type(error).__name__)
    try:
        chatwoot(
            "POST",
            f"/conversations/{conversation_id}/messages",
            {"content": "Reply not sent: " + reason, "message_type": "outgoing", "private": True},
        )
    except Exception as error:  # noqa: BLE001
        log("Could not leave the note:", type(error).__name__)


def handle_outbound(payload):
    """A Chatwoot webhook: a staff reply in a Messenger chat goes out through GoHighLevel."""
    if payload.get("event") != "message_created":
        return 200, {"ok": True, "ignored": "not a new message"}
    if payload.get("message_type") not in ("outgoing", 1) or payload.get("private"):
        return 200, {"ok": True, "ignored": "not a reply"}
    conversation = payload.get("conversation") or {}
    inbox_id = (payload.get("inbox") or {}).get("id") or conversation.get("inbox_id")
    if INBOX_ID and inbox_id != INBOX_ID and inbox_id not in PAGE_INBOXES.values():
        return 200, {"ok": True, "ignored": "another inbox"}
    sender = (conversation.get("meta") or {}).get("sender") or {}
    identifier = sender.get("identifier") or ""
    if not identifier.startswith(IDENTIFIER_PREFIX):
        return 200, {"ok": True, "ignored": "not a GoHighLevel contact"}
    contact_id = identifier[len(IDENTIFIER_PREFIX):]
    channel = (sender.get("additional_attributes") or {}).get("ghl_channel") or "FB"
    text = (payload.get("content") or "").strip()
    attachments = [a.get("data_url") for a in (payload.get("attachments") or []) if a.get("data_url")]
    if not text and not attachments:
        return 200, {"ok": True, "ignored": "empty"}
    try:
        ghl_send(contact_id, channel, text or " ", attachments)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        log("GoHighLevel refused the reply:", error.code, detail)
        flag_failed(payload, f"GoHighLevel answered {error.code}: {detail}")
        return 502, {"ok": False, "error": f"GoHighLevel answered {error.code}"}
    except Exception as error:  # noqa: BLE001 - say why in the log, the caller only needs the status
        log("Reply not sent:", error)
        flag_failed(payload, str(error))
        return 502, {"ok": False, "error": str(error)[:200]}
    return 200, {"ok": True}


class Handler(BaseHTTPRequestHandler):
    def _reply(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/ghl/health":
            return self._reply(
                200, {"ok": True, "inbox": INBOX_ID, "pages": len(PAGE_INBOXES), "can_reply": bool(GHL_TOKEN)}
            )
        return self._reply(404, {"ok": False})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        key = urllib.parse.parse_qs(parsed.query).get("key", [""])[0]
        if not BRIDGE_KEY or not hmac.compare_digest(key.encode(), BRIDGE_KEY.encode()):
            return self._reply(401, {"ok": False, "error": "wrong key"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 200_000:
            return self._reply(400, {"ok": False, "error": "bad body"})
        try:
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("not an object")
        except ValueError:
            return self._reply(400, {"ok": False, "error": "not JSON"})
        try:
            if parsed.path == "/ghl/in":
                status, body = handle_inbound(payload)
            elif parsed.path == "/ghl/out":
                status, body = handle_outbound(payload)
            else:
                status, body = 404, {"ok": False}
        except urllib.error.HTTPError as error:
            log("Chatwoot answered", error.code, parsed.path, error.read().decode("utf-8", "replace")[:200])
            status, body = 502, {"ok": False, "error": "inbox not reachable"}
        except Exception as error:  # noqa: BLE001
            log("Failed", parsed.path, type(error).__name__, str(error)[:200])
            status, body = 500, {"ok": False, "error": "failed"}
        return self._reply(status, body)

    def log_message(self, format, *args):  # the key is in the address: never log it
        pass


if __name__ == "__main__":
    if not BRIDGE_KEY or len(BRIDGE_KEY) < 16:
        sys.exit("BRIDGE_KEY must be set (16+ characters)")
    if not CHATWOOT_TOKEN or not INBOX_ID:
        sys.exit("CHATWOOT_TOKEN and INBOX_ID must be set")
    log("ghl-bridge ready; inbox", INBOX_ID, "pages:", PAGE_INBOXES, "can reply:", bool(GHL_TOKEN))
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
