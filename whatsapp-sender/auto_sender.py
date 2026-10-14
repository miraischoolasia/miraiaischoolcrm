#!/usr/bin/env python3
"""Sends the automation messages of the flows that are switched to "send by itself".

Runs on the WhatsApp server next to Chatwoot. It does no deciding: it asks the CRM database (through
the edge function auto-sender) for the next message that is allowed to go out, sends it into the
parent's existing WhatsApp chat through the local Chatwoot, and reports what happened.

It only writes into a chat where the person has written to the school before. Anyone else is handed
back to the approval queue for a person to look at.

Settings (environment, from /opt/mirai-inbox/auto-sender.env):
  SENDER_URL     https://<project>.supabase.co/functions/v1/auto-sender
  SENDER_KEY     the key kept in the database (automation_sender)
  CHATWOOT_URL   default http://127.0.0.1:3000
  CHATWOOT_TOKEN an agent token of the Chatwoot account
  CHATWOOT_ACCOUNT default 1

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

IDLE_SECONDS = 15
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


def pick_conversation(contact_id):
    """The latest chat of this contact in which the person has written, or None."""
    conversations = chatwoot("GET", f"/contacts/{contact_id}/conversations").get("payload", [])
    for conversation in sorted(conversations, key=lambda item: item["id"], reverse=True):
        if person_has_written(conversation["id"]):
            return conversation
    return None


def wait_until_accepted(conversation_id, message_id):
    deadline = time.time() + CONFIRM_SECONDS
    while time.time() < deadline:
        time.sleep(2)
        for message in chatwoot("GET", f"/conversations/{conversation_id}/messages").get("payload", []):
            if message.get("id") != message_id:
                continue
            if message.get("status") == "failed":
                return "failed"
            if message.get("source_id"):
                return "sent"
    return "timeout"


def send(item):
    """Returns (result, error): result is sent, failed or blocked."""
    phone = digits_of(item["phone"])
    contact_id = find_contact(phone)
    if contact_id is None:
        return "blocked", "Has not written to us first (no chat found)."
    conversation = pick_conversation(contact_id)
    if conversation is None:
        return "blocked", "Has not written to us first."
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


def main():
    log("auto-sender started")
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
            time.sleep(IDLE_SECONDS)
            continue

        try:
            result, error = send(item)
        except Exception as problem:
            result, error = "failed", f"The sender could not reach WhatsApp ({type(problem).__name__})."
        log(f"message {item['id']} -> {result}" + (f" ({error})" if error else ""))
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
