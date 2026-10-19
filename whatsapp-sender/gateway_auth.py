"""Decides who may use the WhatsApp gateway.

Caddy asks this service about every request (forward_auth). The browser sends the
Supabase access token of whoever is logged in to the CRM; we ask Supabase two
things with that same token: who is this, and may they see Leads (or, for
/verify-admin, are they an admin). Only then does Caddy add the Chatwoot key and
pass the request on.

Answers are remembered so a chat that polls every few seconds does not call
Supabase every time (each call leaves lines in Supabase's logs, which are limited
on the free plan): a yes for 5 minutes, but never past the moment the login
itself runs out; a no for a minute. So a member of staff who logs out or loses
the Leads permission can keep using the inbox for up to 5 minutes (agreed by the
owner, 2026-10-19). While one question about a login is out, other requests
with the same login wait for its answer instead of asking again.

Runs on the server in /opt/mirai-inbox, mounted into the containers gateway-auth
(Mirai) and gateway-auth-eduhero (EduHero), each with its own env file
(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, REQUIRED_MODULE). Kept in the CRM repo in
whatsapp-sender/; copy it to the server after changes.
"""

import base64
import hashlib
import json
import os
import socket
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Docker's DNS sometimes fails the IPv6 half of a lookup ("Try again"), and then every login check
# fails with it. Supabase answers on IPv4 as well, so only ask for that.
_lookup = socket.getaddrinfo


def _ipv4_only(host, port, family=0, *args, **kwargs):
    return _lookup(host, port, socket.AF_INET, *args, **kwargs)


socket.getaddrinfo = _ipv4_only

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
PUBLISHABLE_KEY = os.environ["SUPABASE_PUBLISHABLE_KEY"]
REQUIRED_MODULE = os.environ.get("REQUIRED_MODULE", "leads")
ALLOWED_TTL = 300
DENIED_TTL = 60
MAX_CACHED = 2000

_cache: dict[str, tuple[float, int]] = {}
_asking: dict[str, threading.Lock] = {}
_lock = threading.Lock()


def supabase(path: str, token: str, body: dict | None = None):
    """Returns (status, parsed JSON or None). Network trouble raises."""
    request = urllib.request.Request(
        f"{SUPABASE_URL}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method="POST" if body is not None else "GET",
        headers={
            "apikey": PUBLISHABLE_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        return error.code, None


def token_expiry(token: str) -> float | None:
    """When the login token runs out (its "exp"), or None if it cannot be read. Only used to remember a
    yes for a shorter time; Supabase itself checks the token."""
    try:
        part = token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
        exp = claims.get("exp")
        return float(exp) if isinstance(exp, (int, float)) and not isinstance(exp, bool) else None
    except Exception:
        return None


def is_refusal(status: int) -> bool:
    """Supabase said no to this login (as opposed to being busy or down)."""
    return 400 <= status < 500 and status != 429


def ask(token: str, admin: bool) -> int | None:
    """Asks Supabase. 200 / 401 / 403, or None when Supabase could not answer."""
    status, user = supabase("/auth/v1/user", token)
    if status == 200 and user and user.get("id"):
        pass
    elif is_refusal(status) or status == 200:
        return 401
    else:
        return None

    if admin:
        status, allowed = supabase("/rest/v1/rpc/is_admin", token, {})
    else:
        status, allowed = supabase("/rest/v1/rpc/has_permission", token, {"p_module": REQUIRED_MODULE})
    if status == 200:
        return 200 if allowed is True else 403
    if status == 401:
        return 401
    if is_refusal(status):
        return 403
    return None


def _remembered(key: str, now: float) -> int | None:
    hit = _cache.get(key)
    return hit[1] if hit and hit[0] > now else None


def decide(token: str, admin: bool = False) -> int:
    """200 allowed, 401 not logged in, 403 logged in without Leads (or not an admin), 503 could not ask."""
    key = hashlib.sha256((("admin:" if admin else "") + token).encode()).hexdigest()
    with _lock:
        hit = _remembered(key, time.time())
        if hit is not None:
            return hit
        asking = _asking.setdefault(key, threading.Lock())

    # One question per login at a time: the others wait here, then find the answer remembered.
    with asking:
        with _lock:
            hit = _remembered(key, time.time())
            if hit is not None:
                return hit
        try:
            result = ask(token, admin)
        except Exception:
            result = None
        now = time.time()
        with _lock:
            _asking.pop(key, None)
            if result is None:
                return 503
            until = now + (ALLOWED_TTL if result == 200 else DENIED_TTL)
            expiry = token_expiry(token)
            if result == 200 and expiry is not None:
                until = min(until, expiry)
            if len(_cache) > MAX_CACHED:
                _cache.clear()
            if until > now:
                _cache[key] = (until, result)
        return result


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Caddy keeps the original query string on the check request; ignore it.
        path = self.path.split("?", 1)[0]
        if path == "/health":
            return self.reply(200)
        if path not in ("/verify", "/verify-admin"):
            return self.reply(404)
        header = self.headers.get("Authorization", "")
        if not header.lower().startswith("bearer ") or len(header) < 20:
            return self.reply(401)
        return self.reply(decide(header[7:].strip(), admin=(path == "/verify-admin")))

    def reply(self, status: int):
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, format, *args):  # never write tokens or paths to the log
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 9000), Handler).serve_forever()
