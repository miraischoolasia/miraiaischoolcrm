"""Adding and switching WhatsApp numbers from the CRM. Run: python -m unittest discover -s whatsapp-sender"""
import json
import os
import threading
import unittest
import urllib.error
import urllib.request
from unittest import mock

os.environ.update({
    "EVOLUTION_URL": "http://evolution-eduhero:8080", "EVOLUTION_KEY": "evo-key", "CHATWOOT_TOKEN": "cw-token",
    "CHATWOOT_ACCOUNT": "2", "SUPABASE_URL": "https://example.supabase.co", "SUPABASE_PUBLISHABLE_KEY": "pub",
    "INSTANCE_PREFIX": "eduhero", "MAX_NUMBERS": "4", "MAX_PER_DAY": "2",
})

import wa_numbers  # noqa: E402

TOKEN = "header.payload.signature-of-an-admin"


class World:
    """Evolution, Chatwoot and the CRM database as the service sees them; every call is written down."""

    def __init__(self, instances=None, inboxes=None, rows=None, fail=None):
        self.instances = instances if instances is not None else [
            {"name": "eduhero", "connectionStatus": "open", "createdAt": "2026-10-19T07:00:00Z"},
            {"name": "eduhero-2", "connectionStatus": "close", "createdAt": "2026-10-20T03:00:00Z"},
            {"name": "mirai-test", "connectionStatus": "open", "createdAt": "2026-10-07T00:00:00Z"},
        ]
        self.inboxes = inboxes if inboxes is not None else [
            {"id": 3, "name": "EduHero WhatsApp", "webhook_url": "http://evolution-eduhero:8080/chatwoot/webhook/eduhero"},
            {"id": 4, "name": "EduHero Online", "webhook_url": "http://ghl-bridge-eduhero:9100/ghl/out?key=k"},
            {"id": 6, "name": "EduHero WhatsApp 2", "webhook_url": "http://evolution-eduhero:8080/chatwoot/webhook/eduhero-2"},
        ]
        self.rows = rows if rows is not None else [
            {"id": 1, "label": "Main", "chatwoot_inbox_id": 3, "evolution_instance": "eduhero", "is_active": True},
        ]
        self.fail = fail or set()
        self.calls = []

    def answer(self, kind, method, path, body):
        self.calls.append((kind, method, path))
        if (kind, method) in self.fail:
            return 500, None
        if kind == "evolution":
            if method == "GET":
                return 200, self.instances
            if path == "/instance/create":
                self.instances.append({"name": body["instanceName"], "connectionStatus": "close", "createdAt": "2026-10-20T09:00:00Z"})
                return 201, {"instance": {"instanceName": body["instanceName"]}}
            if path.startswith("/instance/delete/"):
                self.instances = [i for i in self.instances if i["name"] != path.rsplit("/", 1)[1]]
                return 200, {}
            if path.startswith("/instance/logout/"):
                return 400, {"error": "not connected"}
            return 201, {}
        if kind == "chatwoot":
            if method == "GET":
                return 200, {"payload": self.inboxes}
            if method == "POST":
                inbox = {"id": 7, "name": body["name"], "webhook_url": body["channel"]["webhook_url"]}
                self.inboxes.append(inbox)
                return 200, inbox
            if method == "DELETE":
                self.inboxes = [i for i in self.inboxes if i["id"] != int(path.rsplit("/", 1)[1])]
                return 200, None
        if kind == "supabase":
            if method == "GET":
                return 200, self.rows
            if method == "POST":
                row = {"id": 9, **body}
                self.rows.append(row)
                return 201, [row]
            if method == "PATCH":
                name = path.rsplit("eq.", 1)[1]
                changed = [r for r in self.rows if r["evolution_instance"] == name]
                for row in changed:
                    row.update(body)
                return 200, changed
        raise AssertionError((kind, method, path))

    def patch(self, case):
        for kind in ("evolution", "chatwoot"):
            patcher = mock.patch.object(wa_numbers, kind, lambda method, path, body=None, kind=kind: self.answer(kind, method, path, body))
            patcher.start()
            case.addCleanup(patcher.stop)
        patcher = mock.patch.object(wa_numbers, "supabase", lambda method, path, token, body=None: self.answer("supabase", method, path, body))
        patcher.start()
        case.addCleanup(patcher.stop)
        return self


class Names(unittest.TestCase):
    def test_only_the_schools_own_numbers(self):
        self.assertEqual(wa_numbers.number_of("eduhero"), 1)
        self.assertEqual(wa_numbers.number_of("eduhero-12"), 12)
        self.assertFalse(wa_numbers.NAME.match("mirai-test"))
        self.assertFalse(wa_numbers.NAME.match("eduhero-x"))
        self.assertFalse(wa_numbers.NAME.match("eduhero-1234"))

    def test_next_name_follows_the_highest(self):
        self.assertEqual(wa_numbers.next_name(["eduhero"]), "eduhero-2")
        self.assertEqual(wa_numbers.next_name(["eduhero", "eduhero-2"]), "eduhero-3")
        self.assertEqual(wa_numbers.next_name(["eduhero", "eduhero-5"]), "eduhero-6")
        self.assertEqual(wa_numbers.next_name([]), "eduhero-2")


class Listing(unittest.TestCase):
    def test_lists_the_schools_numbers_with_inbox_label_state(self):
        World().patch(self)
        self.assertEqual(wa_numbers.list_numbers(TOKEN), [
            {"instance": "eduhero", "inboxId": 3, "label": "Main", "state": "open", "active": True},
            {"instance": "eduhero-2", "inboxId": 6, "label": "EduHero WhatsApp 2", "state": "close", "active": True},
        ])


class Adding(unittest.TestCase):
    def test_makes_inbox_then_number_then_row(self):
        world = World().patch(self)
        with mock.patch.object(wa_numbers.datetime, "datetime", wraps=wa_numbers.datetime.datetime) as clock:
            clock.now.return_value = wa_numbers.datetime.datetime(2026, 10, 21, tzinfo=wa_numbers.datetime.timezone.utc)
            made = wa_numbers.add_number(TOKEN, "  Sales   phone ")
        self.assertEqual(made, {"id": 9, "instance": "eduhero-3", "inboxId": 7})
        writes = [call for call in world.calls if call[1] != "GET"]
        self.assertEqual(writes, [
            ("chatwoot", "POST", "/inboxes"),
            ("evolution", "POST", "/instance/create"),
            ("evolution", "POST", "/chatwoot/set/eduhero-3"),
            ("supabase", "POST", "/rest/v1/whatsapp_numbers"),
        ])
        self.assertEqual(world.inboxes[-1]["webhook_url"], "http://evolution-eduhero:8080/chatwoot/webhook/eduhero-3")
        self.assertEqual(world.rows[-1]["label"], "Sales phone")

    def test_a_failed_step_takes_back_what_was_made(self):
        world = World(fail={("supabase", "POST")}).patch(self)
        with self.assertRaises(wa_numbers.Refused):
            wa_numbers.add_number(TOKEN, "Sales")
        self.assertNotIn("eduhero-3", [i["name"] for i in world.instances])
        self.assertNotIn(7, [i["id"] for i in world.inboxes])
        self.assertIn(("evolution", "DELETE", "/instance/delete/eduhero-3"), world.calls)
        self.assertIn(("chatwoot", "DELETE", "/inboxes/7"), world.calls)

    def test_limits(self):
        full = [{"name": f"eduhero-{n}", "connectionStatus": "close", "createdAt": "2026-10-01T00:00:00Z"} for n in range(2, 6)]
        World(instances=full).patch(self)
        with self.assertRaises(wa_numbers.Refused) as caught:
            wa_numbers.add_number(TOKEN, "Sales")
        self.assertEqual((caught.exception.status, caught.exception.reason), (409, "limit"))

    def test_daily_limit(self):
        today = wa_numbers.datetime.datetime.now(wa_numbers.datetime.timezone.utc).strftime("%Y-%m-%dT01:00:00Z")
        made_today = [{"name": f"eduhero-{n}", "connectionStatus": "close", "createdAt": today} for n in (2, 3)]
        World(instances=made_today).patch(self)
        with self.assertRaises(wa_numbers.Refused) as caught:
            wa_numbers.add_number(TOKEN, "Sales")
        self.assertEqual(caught.exception.reason, "daily limit")

    def test_names(self):
        World().patch(self)
        for bad in ("", "   ", "x" * 61):
            with self.assertRaises(wa_numbers.Refused):
                wa_numbers.add_number(TOKEN, bad)
        with self.assertRaises(wa_numbers.Refused) as caught:
            wa_numbers.add_number(TOKEN, "EduHero WhatsApp 2")  # an inbox has this name already
        self.assertEqual(caught.exception.status, 409)


class Switching(unittest.TestCase):
    def test_switch_off_logs_out_and_keeps_the_row(self):
        world = World().patch(self)
        wa_numbers.disable_number(TOKEN, "eduhero")
        self.assertIn(("evolution", "DELETE", "/instance/logout/eduhero"), world.calls)
        self.assertFalse(world.rows[0]["is_active"])
        self.assertEqual(len(world.inboxes), 3)  # the inbox and its chats stay

    def test_a_number_without_a_row_gets_one(self):
        world = World().patch(self)
        wa_numbers.disable_number(TOKEN, "eduhero-2")
        self.assertEqual(world.rows[-1], {"id": 9, "label": "EduHero WhatsApp 2", "chatwoot_inbox_id": 6, "evolution_instance": "eduhero-2", "is_active": False})

    def test_switch_on(self):
        world = World(rows=[{"id": 1, "label": "Main", "chatwoot_inbox_id": 3, "evolution_instance": "eduhero", "is_active": False}]).patch(self)
        wa_numbers.enable_number(TOKEN, "eduhero")
        self.assertTrue(world.rows[0]["is_active"])
        self.assertNotIn(("evolution", "DELETE", "/instance/logout/eduhero"), world.calls)

    def test_only_the_schools_existing_numbers(self):
        world = World().patch(self)
        for name in ("mirai-test", "eduhero-9", "../x"):
            with self.assertRaises(wa_numbers.Refused) as caught:
                wa_numbers.disable_number(TOKEN, name)
            self.assertEqual(caught.exception.status, 404)
        self.assertFalse([call for call in world.calls if call[1] != "GET"])


class Http(unittest.TestCase):
    def setUp(self):
        self.world = World().patch(self)
        self.server = wa_numbers.ThreadingHTTPServer(("127.0.0.1", 0), wa_numbers.Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def call(self, method, path, body=None, token=TOKEN):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.server.server_address[1]}{path}",
            data=json.dumps(body).encode() if body is not None else None, method=method, headers=headers,
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            raw = error.read()
            try:
                return error.code, json.loads(raw)
            except ValueError:
                return error.code, None

    def test_routes(self):
        self.assertEqual(self.call("GET", "/wa/numbers")[0], 200)
        self.assertEqual(self.call("GET", "/wa/numbers", token=None), (401, {"error": "Not logged in."}))
        status, made = self.call("POST", "/wa/numbers", {"label": "Sales"})
        self.assertEqual((status, made["instance"]), (201, "eduhero-3"))
        self.assertEqual(self.call("POST", "/wa/numbers/eduhero-3/disable", {}), (200, {"ok": True}))
        self.assertEqual(self.call("POST", "/wa/numbers/eduhero-3/enable", {}), (200, {"ok": True}))
        self.assertEqual(self.call("POST", "/wa/numbers/mirai-test/disable", {})[0], 404)
        self.assertEqual(self.call("DELETE", "/wa/numbers/eduhero-3")[0], 501)
        self.assertEqual(self.call("GET", "/wa/other")[0], 404)

    def test_a_server_problem_is_a_short_message(self):
        self.world.fail = {("evolution", "GET")}
        status, body = self.call("GET", "/wa/numbers")
        self.assertEqual(status, 502)
        self.assertNotIn("evo-key", json.dumps(body))


if __name__ == "__main__":
    unittest.main()
