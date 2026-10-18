#!/usr/bin/env python3
"""Joins the two chat contacts of one person: the phone number and the hidden ID WhatsApp sometimes uses instead.

When a parent writes from their hidden ID and the message does not say which phone number it is, Chatwoot makes
a second contact (and a second chat) for the same person. WhatsApp does tell the pairing now and then (the
"remoteJidAlt" of a message), and Evolution keeps it. This reads those pairs and, where both the hidden-ID contact
and the phone contact exist as separate Chatwoot contacts, merges the hidden-ID one into the phone one (the chats
and messages move over, nothing is lost).

Only a pair WhatsApp itself reported is used; a name is never enough. A hidden ID or a phone number that appears
in more than one pair is skipped.

Runs on the WhatsApp server. Without --apply it only lists what it would merge.

Settings (environment, the same file as the auto sender, /opt/mirai-inbox/auto-sender.env):
  CHATWOOT_URL     default http://127.0.0.1:3000
  CHATWOOT_TOKEN   an agent token of the Chatwoot account
  CHATWOOT_ACCOUNT default 1
  EVO_DB_CONTAINER default whatsapp-inbox-test-evo-postgres-1 (Evolution's database)

Names and messages are never written to the log.
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

CHATWOOT_URL = os.environ.get("CHATWOOT_URL", "http://127.0.0.1:3000").rstrip("/")
CHATWOOT_TOKEN = os.environ["CHATWOOT_TOKEN"]
ACCOUNT = os.environ.get("CHATWOOT_ACCOUNT", "1")
EVO_DB_CONTAINER = os.environ.get("EVO_DB_CONTAINER", "whatsapp-inbox-test-evo-postgres-1")
API = f"{CHATWOOT_URL}/api/v1/accounts/{ACCOUNT}"

PAIRS_SQL = (
    "select distinct key->>'remoteJid', key->>'remoteJidAlt' from \"Message\" "
    "where key->>'remoteJid' like '%@lid' and key->>'remoteJidAlt' like '%@s.whatsapp.net'"
)


def log(text):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), text, flush=True)


def chatwoot(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={"api_access_token": CHATWOOT_TOKEN, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read().decode()
        return json.loads(raw) if raw else {}


def known_pairs():
    """(hidden ID, phone) pairs WhatsApp reported, each only when it is unambiguous."""
    out = subprocess.run(
        ["docker", "exec", EVO_DB_CONTAINER, "psql", "-U", "postgres", "-d", "evolution", "-At", "-F", ",", "-c", PAIRS_SQL],
        capture_output=True,
        text=True,
        timeout=60,
        check=True,
    ).stdout
    pairs = [line.split(",") for line in out.splitlines() if line.count(",") == 1]
    lids = {}
    phones = {}
    for lid, phone in pairs:
        lids.setdefault(lid, set()).add(phone)
        phones.setdefault(phone, set()).add(lid)
    return [(lid, phone) for lid, phone in pairs if len(lids[lid]) == 1 and len(phones[phone]) == 1]


def contacts_by_identifier():
    found = {}
    page = 1
    while page <= 200:
        payload = chatwoot("GET", f"/contacts?page={page}&sort=id").get("payload", [])
        if not payload:
            break
        for contact in payload:
            identifier = contact.get("identifier") or ""
            if identifier:
                found[identifier] = contact["id"]
        page += 1
    return found


def main(apply):
    contacts = contacts_by_identifier()
    todo = [
        (contacts[lid], contacts[phone])
        for lid, phone in known_pairs()
        if lid in contacts and phone in contacts and contacts[lid] != contacts[phone]
    ]
    if not todo:
        log("no split chats")
        return 0
    for hidden_contact, phone_contact in todo:
        if not apply:
            log(f"would merge contact {hidden_contact} into {phone_contact}")
            continue
        chatwoot("POST", "/actions/contact_merge", {"base_contact_id": phone_contact, "mergee_contact_id": hidden_contact})
        log(f"merged contact {hidden_contact} into {phone_contact}")
    return len(todo)


if __name__ == "__main__":
    try:
        main("--apply" in sys.argv)
    except Exception as problem:  # keep the timer alive; the next round tries again
        log(f"failed: {type(problem).__name__}")
        sys.exit(1)
