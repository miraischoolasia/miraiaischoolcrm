"""Lets a school's admin add, list, switch off and switch on its WhatsApp numbers from the CRM.

The gateway sends /wa/numbers here only after its admin check (forward_auth /verify-admin), with the admin's own
Supabase token still on the request. Adding a number:

  1. picks the next free name (eduhero-3, eduhero-4, ...),
  2. makes a Chatwoot inbox for it (an API channel whose webhook is that number in Evolution),
  3. makes the number in Evolution without a QR (qrcode false), joined to that inbox, with no history import,
  4. writes the row in the CRM's whatsapp_numbers as that admin (the database's own rules let only admins do it),

and undoes what it made when a later step fails. The CRM then shows the number's QR (/wa/connect/qr?instance=...).

Switching a number off logs it out of WhatsApp (the phone's "Linked devices" entry goes) and marks the row inactive;
its chats stay. Switching it on marks the row active again; it is then linked again by scanning a new QR. Deleting a
number for good is not offered here (it cannot be undone): the server team does that with the setup script.

  GET  /wa/numbers                       -> [{instance, inboxId, label, state, active}]
  POST /wa/numbers {"label": "..."}      -> 201 {id, instance, inboxId}
  POST /wa/numbers/<instance>/disable    -> {ok: true}
  POST /wa/numbers/<instance>/enable     -> {ok: true}

One per school (white label), set by its env file:
  EVOLUTION_URL   e.g. http://evolution-eduhero:8080        EVOLUTION_KEY    that Evolution's API key
  CHATWOOT_URL    default http://chatwoot-rails:3000        CHATWOOT_TOKEN   an administrator token of the account
  CHATWOOT_ACCOUNT the school's Chatwoot account id         INSTANCE_PREFIX  e.g. eduhero (numbers: eduhero, eduhero-2..)
  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY                    the school's CRM database
  MAX_NUMBERS     default 10 (all numbers, linked or not)   MAX_PER_DAY      default 5 (numbers added per day)
Keys never leave this service, and nothing it logs holds a token or a message.
"""

import datetime
import json
import os
import re
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Docker's DNS sometimes fails the IPv6 half of a lookup; Supabase answers on IPv4 too (as in gateway_auth.py).
_lookup = socket.getaddrinfo


def _ipv4_only(host, port, family=0, *args, **kwargs):
    return _lookup(host, port, socket.AF_INET, *args, **kwargs)


socket.getaddrinfo = _ipv4_only

EVOLUTION_URL = os.environ.get("EVOLUTION_URL", "").rstrip("/")
EVOLUTION_KEY = os.environ.get("EVOLUTION_KEY", "")
CHATWOOT_URL = os.environ.get("CHATWOOT_URL", "http://chatwoot-rails:3000").rstrip("/")
CHATWOOT_TOKEN = os.environ.get("CHATWOOT_TOKEN", "")
CHATWOOT_ACCOUNT = os.environ.get("CHATWOOT_ACCOUNT", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
PUBLISHABLE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
PREFIX = os.environ.get("INSTANCE_PREFIX", "")
MAX_NUMBERS = int(os.environ.get("MAX_NUMBERS", "10"))
MAX_PER_DAY = int(os.environ.get("MAX_PER_DAY", "5"))

# The school's own numbers only: "eduhero" and "eduhero-<1 to 3 digits>".
NAME = re.compile(r"^%s(-([0-9]{1,3}))?$" % re.escape(PREFIX)) if PREFIX else re.compile(r"(?!)")
WEBHOOK_PATH = "/chatwoot/webhook/"
STATES = ("open", "connecting", "close")

# Only one number is added at a time, so two clicks cannot pick the same name.
_adding = threading.Lock()


class Refused(Exception):
    """A request this service will not do; status and a short reason for the CRM."""

    def __init__(self, status, reason):
        super().__init__(reason)
        self.status = status
        self.reason = reason


def log(*parts):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *parts, flush=True)


def http(method, url, headers, body=None, timeout=25):
    """(status, parsed JSON or None). Network trouble raises."""
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **headers})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            return error.code, json.loads(raw) if raw else None
        except ValueError:
            return error.code, None


def evolution(method, path, body=None):
    return http(method, EVOLUTION_URL + path, {"apikey": EVOLUTION_KEY}, body)


def chatwoot(method, path, body=None):
    return http(method, f"{CHATWOOT_URL}/api/v1/accounts/{CHATWOOT_ACCOUNT}{path}", {"api_access_token": CHATWOOT_TOKEN}, body)


def supabase(method, path, token, body=None):
    headers = {"apikey": PUBLISHABLE_KEY, "Authorization": f"Bearer {token}", "Prefer": "return=representation"}
    return http(method, SUPABASE_URL + path, headers, body)


def must(result, what):
    status, data = result
    if not 200 <= status < 300:
        log(what, "failed: HTTP", status)
        raise Refused(502, f"{what} failed ({status})")
    return data


def number_of(name):
    """eduhero -> 1, eduhero-3 -> 3."""
    match = NAME.match(name)
    return int(match.group(2)) if match and match.group(2) else 1


def instances():
    """The school's numbers in Evolution: [{name, state, createdAt}]."""
    found = must(evolution("GET", "/instance/fetchInstances"), "reading the numbers") or []
    numbers = [
        {"name": item.get("name"), "state": item.get("connectionStatus"), "createdAt": item.get("createdAt") or ""}
        for item in found
        if isinstance(item, dict) and NAME.match(item.get("name") or "")
    ]
    return sorted(numbers, key=lambda item: number_of(item["name"]))


def inboxes():
    """Chatwoot inbox of each number, from the inbox's webhook ({name: {id, name}}), and all inbox names."""
    found = (must(chatwoot("GET", "/inboxes"), "reading the inboxes") or {}).get("payload", [])
    by_number = {}
    for inbox in found:
        url = (inbox.get("webhook_url") or "").split("?", 1)[0]
        if WEBHOOK_PATH in url:
            by_number[url.rsplit(WEBHOOK_PATH, 1)[1]] = {"id": inbox["id"], "name": inbox.get("name") or ""}
    return by_number, {inbox.get("name") for inbox in found}


def rows(token):
    """The CRM's rows, by number name."""
    data = must(
        supabase("GET", "/rest/v1/whatsapp_numbers?select=id,label,chatwoot_inbox_id,evolution_instance,is_active", token),
        "reading the CRM's numbers",
    )
    return {row["evolution_instance"]: row for row in data or [] if row.get("evolution_instance")}


def list_numbers(token):
    by_inbox, _names = inboxes()
    saved = rows(token)
    result = []
    for item in instances():
        name = item["name"]
        inbox = by_inbox.get(name) or {}
        row = saved.get(name) or {}
        result.append({
            "instance": name,
            "inboxId": row.get("chatwoot_inbox_id") or inbox.get("id"),
            "label": row.get("label") or inbox.get("name") or name,
            "state": item["state"] if item["state"] in STATES else "close",
            "active": row.get("is_active", True),
        })
    return result


def next_name(names):
    """The next number after the highest one there is (never reusing a removed one's name: its chats keep it)."""
    highest = max((number_of(name) for name in names), default=1)
    return f"{PREFIX}-{max(highest + 1, 2)}"


def clean_label(value):
    label = " ".join(str(value or "").split())
    if not 1 <= len(label) <= 60:
        raise Refused(400, "The name must be 1 to 60 characters.")
    return label


def add_number(token, label):
    label = clean_label(label)
    with _adding:
        current = instances()
        if len(current) >= MAX_NUMBERS:
            raise Refused(409, "limit")
        today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        if sum(1 for item in current if item["createdAt"].startswith(today)) >= MAX_PER_DAY:
            raise Refused(409, "daily limit")
        _by_inbox, names = inboxes()
        # Evolution finds a number's inbox by its name, so two inboxes may not share one.
        if label in names:
            raise Refused(409, "An inbox with this name exists already.")
        name = next_name([item["name"] for item in current])
        made = []
        try:
            inbox = must(
                chatwoot("POST", "/inboxes", {"name": label, "channel": {"type": "api", "webhook_url": EVOLUTION_URL + WEBHOOK_PATH + name}}),
                "making the inbox",
            )
            inbox_id = inbox["id"]
            made.append(("inbox", inbox_id))
            must(
                evolution("POST", "/instance/create", {
                    "instanceName": name, "integration": "WHATSAPP-BAILEYS", "qrcode": False, "groupsIgnore": False,
                    "syncFullHistory": False, "alwaysOnline": False, "readMessages": False, "readStatus": False,
                    "rejectCall": False,
                }),
                "making the number",
            )
            made.append(("instance", name))
            must(
                evolution("POST", f"/chatwoot/set/{name}", {
                    "enabled": True, "accountId": str(CHATWOOT_ACCOUNT), "token": CHATWOOT_TOKEN, "url": CHATWOOT_URL,
                    "signMsg": False, "reopenConversation": True, "conversationPending": False, "nameInbox": label,
                    "mergeBrazilContacts": False, "importContacts": False, "importMessages": False,
                    "daysLimitImportMessages": 3650, "autoCreate": False, "ignoreJids": [],
                }),
                "joining the number to its inbox",
            )
            saved = must(
                supabase("POST", "/rest/v1/whatsapp_numbers", token, {
                    "label": label, "chatwoot_inbox_id": inbox_id, "evolution_instance": name, "is_active": True,
                }),
                "saving the number in the CRM",
            )
        except Exception:
            undo(made)
            raise
        log("added number", name, "inbox", inbox_id)
        return {"id": (saved or [{}])[0].get("id"), "instance": name, "inboxId": inbox_id}


def undo(made):
    """Takes back what add_number made, newest first. A new inbox holds nothing yet, so removing it loses nothing."""
    for kind, value in reversed(made):
        try:
            if kind == "instance":
                evolution("DELETE", f"/instance/delete/{value}")
            elif kind == "inbox":
                chatwoot("DELETE", f"/inboxes/{value}")
            log("undid", kind, value)
        except Exception as problem:
            log("could not undo", kind, value, type(problem).__name__)


def known_number(name):
    if not NAME.match(name or ""):
        raise Refused(404, "No such number.")
    if name not in {item["name"] for item in instances()}:
        raise Refused(404, "No such number.")


def set_active(token, name, active):
    """Marks the CRM's row; a number with no row yet (one made before this service) gets one."""
    changed = must(
        supabase("PATCH", "/rest/v1/whatsapp_numbers?evolution_instance=eq." + urllib.parse.quote(name), token, {"is_active": active}),
        "saving the number in the CRM",
    )
    if changed:
        return
    inbox = inboxes()[0].get(name)
    if not inbox:
        raise Refused(404, "This number has no inbox.")
    must(
        supabase("POST", "/rest/v1/whatsapp_numbers", token, {
            "label": inbox["name"] or name, "chatwoot_inbox_id": inbox["id"], "evolution_instance": name, "is_active": active,
        }),
        "saving the number in the CRM",
    )


def disable_number(token, name):
    known_number(name)
    status, _ = evolution("DELETE", f"/instance/logout/{name}")
    # A number that is not linked answers an error here; it is off either way.
    if status >= 500:
        raise Refused(502, f"logging the number out failed ({status})")
    set_active(token, name, False)
    log("switched off", name)


def enable_number(token, name):
    known_number(name)
    set_active(token, name, True)
    log("switched on", name)


ACTION = re.compile(r"^/wa/numbers/([A-Za-z0-9_-]{1,60})/(disable|enable)$")


class Handler(BaseHTTPRequestHandler):
    def token(self):
        header = self.headers.get("Authorization", "")
        if not header.lower().startswith("bearer ") or len(header) < 20:
            raise Refused(401, "Not logged in.")
        return header[7:].strip()

    def run(self, work):
        try:
            status, body = work()
        except Refused as refused:
            status, body = refused.status, {"error": refused.reason}
        except Exception as problem:
            log("failed:", type(problem).__name__)
            status, body = 502, {"error": "The WhatsApp server could not do it. Try again in a minute."}
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def path_only(self):
        return self.path.split("?", 1)[0].rstrip("/")

    def do_GET(self):
        path = self.path_only()
        if path == "/health":
            return self.run(lambda: (200, {"ok": True}))
        if path != "/wa/numbers":
            return self.run(lambda: (404, {"error": "Not found."}))
        self.run(lambda: (200, list_numbers(self.token())))

    def do_POST(self):
        path = self.path_only()
        if path == "/wa/numbers":
            def add():
                token = self.token()
                length = int(self.headers.get("Content-Length") or 0)
                if length > 10_000:
                    raise Refused(400, "Too large.")
                try:
                    body = json.loads(self.rfile.read(length) or b"{}")
                except ValueError:
                    raise Refused(400, "Invalid request body.")
                return 201, add_number(token, (body or {}).get("label"))
            return self.run(add)
        match = ACTION.match(path)
        if not match:
            return self.run(lambda: (404, {"error": "Not found."}))
        name, action = match.groups()

        def switch():
            token = self.token()
            (disable_number if action == "disable" else enable_number)(token, name)
            return 200, {"ok": True}
        self.run(switch)

    def log_message(self, format, *args):  # never write tokens to the log
        pass


if __name__ == "__main__":
    missing = [key for key in ("EVOLUTION_URL", "EVOLUTION_KEY", "CHATWOOT_TOKEN", "CHATWOOT_ACCOUNT", "SUPABASE_URL",
                               "SUPABASE_PUBLISHABLE_KEY", "INSTANCE_PREFIX") if not os.environ.get(key)]
    if missing:
        raise SystemExit("missing settings: " + ", ".join(missing))
    log("wa-numbers for", PREFIX, "started")
    ThreadingHTTPServer(("0.0.0.0", 9200), Handler).serve_forever()
