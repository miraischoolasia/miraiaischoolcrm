"""How long the inbox gateway remembers a login check. Run: python -m unittest discover -s whatsapp-sender"""
import base64
import json
import os
import threading
import time
import unittest
from unittest import mock

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")

import gateway_auth  # noqa: E402

NOW = 1_800_000_000.0


def token_with_exp(exp):
    def part(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")

    return f"{part({'alg': 'HS256'})}.{part({'sub': 'u1', 'exp': exp})}.signature"


class FakeSupabase:
    """Answers like Supabase and counts the questions."""

    def __init__(self, user_status=200, allowed=True, permission_status=200, delay=0.0):
        self.user_status = user_status
        self.allowed = allowed
        self.permission_status = permission_status
        self.delay = delay
        self.calls = []
        self.lock = threading.Lock()

    def __call__(self, path, token, body=None):
        with self.lock:
            self.calls.append(path)
        if self.delay:
            time.sleep(self.delay)
        if path == "/auth/v1/user":
            return self.user_status, ({"id": "u1"} if self.user_status == 200 else None)
        return self.permission_status, (self.allowed if self.permission_status == 200 else None)


class Decide(unittest.TestCase):
    def setUp(self):
        gateway_auth._cache.clear()
        gateway_auth._asking.clear()
        self.clock = NOW
        patcher = mock.patch.object(gateway_auth.time, "time", lambda: self.clock)
        patcher.start()
        self.addCleanup(patcher.stop)

    def use(self, fake):
        patcher = mock.patch.object(gateway_auth, "supabase", fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        return fake

    def test_a_yes_is_remembered_for_5_minutes(self):
        fake = self.use(FakeSupabase())
        token = token_with_exp(NOW + 3600)
        self.assertEqual(gateway_auth.decide(token), 200)
        self.clock = NOW + 299
        self.assertEqual(gateway_auth.decide(token), 200)
        self.assertEqual(len(fake.calls), 2)  # one check: who is this + may they see Leads
        self.clock = NOW + 301
        self.assertEqual(gateway_auth.decide(token), 200)
        self.assertEqual(len(fake.calls), 4)

    def test_a_yes_is_not_remembered_past_the_end_of_the_login(self):
        fake = self.use(FakeSupabase())
        token = token_with_exp(NOW + 100)
        gateway_auth.decide(token)
        self.clock = NOW + 99
        gateway_auth.decide(token)
        self.assertEqual(len(fake.calls), 2)
        self.clock = NOW + 101
        gateway_auth.decide(token)
        self.assertEqual(len(fake.calls), 4)

    def test_a_token_that_cannot_be_read_still_gets_5_minutes(self):
        fake = self.use(FakeSupabase())
        gateway_auth.decide("not-a-jwt-but-long-enough")
        self.clock = NOW + 299
        gateway_auth.decide("not-a-jwt-but-long-enough")
        self.assertEqual(len(fake.calls), 2)

    def test_no_leads_permission_is_remembered_for_a_minute(self):
        fake = self.use(FakeSupabase(allowed=False))
        token = token_with_exp(NOW + 3600)
        self.assertEqual(gateway_auth.decide(token), 403)
        self.clock = NOW + 59
        self.assertEqual(gateway_auth.decide(token), 403)
        self.assertEqual(len(fake.calls), 2)
        self.clock = NOW + 61
        gateway_auth.decide(token)
        self.assertEqual(len(fake.calls), 4)

    def test_a_refused_login_is_401(self):
        for status in (401, 403):
            gateway_auth._cache.clear()
            fake = self.use(FakeSupabase(user_status=status))
            self.assertEqual(gateway_auth.decide(token_with_exp(NOW + 3600)), 401)
            self.assertEqual(fake.calls, ["/auth/v1/user"])

    def test_supabase_down_is_503_and_not_remembered(self):
        for fake in (FakeSupabase(user_status=500), FakeSupabase(user_status=429), FakeSupabase(permission_status=502)):
            gateway_auth._cache.clear()
            self.use(fake)
            token = token_with_exp(NOW + 3600)
            self.assertEqual(gateway_auth.decide(token), 503)
            asked = len(fake.calls)
            gateway_auth.decide(token)
            self.assertEqual(len(fake.calls), asked * 2)

    def test_network_trouble_is_503(self):
        def broken(path, token, body=None):
            raise OSError("down")

        self.use(broken)
        self.assertEqual(gateway_auth.decide(token_with_exp(NOW + 3600)), 503)

    def test_admin_check_is_remembered_apart(self):
        fake = self.use(FakeSupabase())
        token = token_with_exp(NOW + 3600)
        gateway_auth.decide(token)
        gateway_auth.decide(token, admin=True)
        self.assertEqual(fake.calls, ["/auth/v1/user", "/rest/v1/rpc/has_permission", "/auth/v1/user", "/rest/v1/rpc/is_admin"])

    def test_requests_at_the_same_moment_share_one_check(self):
        fake = self.use(FakeSupabase(delay=0.05))
        token = token_with_exp(NOW + 3600)
        results = []
        threads = [threading.Thread(target=lambda: results.append(gateway_auth.decide(token))) for _ in range(6)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(results, [200] * 6)
        self.assertEqual(len(fake.calls), 2)


class FakeTicks:
    """Answers has_permission per tick, like Supabase for a person with only some ticks."""

    def __init__(self, ticks):
        self.ticks = ticks
        self.asked = []

    def __call__(self, path, token, body=None):
        if path == "/auth/v1/user":
            return 200, {"id": "u1"}
        self.asked.append((body or {}).get("p_module"))
        return 200, (body or {}).get("p_module") in self.ticks


class AlsoModules(unittest.TestCase):
    """ALSO_MODULES: the Student Inbox tick opens the gateway too (each chat is still checked on its own)."""

    def setUp(self):
        gateway_auth._cache.clear()
        gateway_auth._asking.clear()
        for name, value in (("REQUIRED_MODULE", "inbox"), ("ALSO_MODULES", ["student_inbox"])):
            patcher = mock.patch.object(gateway_auth, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def use(self, fake):
        patcher = mock.patch.object(gateway_auth, "supabase", fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        return fake

    def test_the_inbox_tick_alone_asks_once(self):
        fake = self.use(FakeTicks({"inbox"}))
        self.assertEqual(gateway_auth.decide(token_with_exp(time.time() + 3600)), 200)
        self.assertEqual(fake.asked, ["inbox"])

    def test_the_student_inbox_tick_alone_is_let_in(self):
        fake = self.use(FakeTicks({"student_inbox"}))
        self.assertEqual(gateway_auth.decide(token_with_exp(time.time() + 3600)), 200)
        self.assertEqual(fake.asked, ["inbox", "student_inbox"])

    def test_neither_tick_is_403(self):
        fake = self.use(FakeTicks(set()))
        self.assertEqual(gateway_auth.decide(token_with_exp(time.time() + 3600)), 403)
        self.assertEqual(fake.asked, ["inbox", "student_inbox"])

    def test_without_also_modules_nothing_changes(self):
        with mock.patch.object(gateway_auth, "ALSO_MODULES", []):
            fake = self.use(FakeTicks({"student_inbox"}))
            self.assertEqual(gateway_auth.decide(token_with_exp(time.time() + 3600)), 403)
            self.assertEqual(fake.asked, ["inbox"])


class FakeChats:
    """Answers inbox_conversation_access like Supabase, per chat number."""

    def __init__(self, levels, status=200):
        self.levels = levels
        self.status = status
        self.calls = []

    def __call__(self, path, token, body=None):
        self.calls.append((path, body))
        if self.status != 200:
            return self.status, None
        return 200, self.levels.get(body["p_conversation_id"], "unknown")


class Conversations(unittest.TestCase):
    def setUp(self):
        gateway_auth._levels.clear()
        self.clock = NOW
        patcher = mock.patch.object(gateway_auth.time, "time", lambda: self.clock)
        patcher.start()
        self.addCleanup(patcher.stop)

    def use(self, fake):
        patcher = mock.patch.object(gateway_auth, "supabase", fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        return fake

    def test_which_requests_are_about_one_chat(self):
        base = "/chatwoot/api/v1/accounts/1/conversations"
        self.assertEqual(gateway_auth.needed_for("POST", f"{base}/12/messages"), (12, "reply"))
        self.assertEqual(gateway_auth.needed_for("GET", f"{base}/12/messages?before=5"), (12, "view"))
        self.assertEqual(gateway_auth.needed_for("DELETE", f"{base}/12/messages/99"), (12, "reply"))
        self.assertEqual(gateway_auth.needed_for("POST", f"{base}/12/custom_attributes"), (12, "reply"))
        self.assertEqual(gateway_auth.needed_for("POST", f"{base}/12/update_last_seen"), (12, "view"))
        self.assertEqual(gateway_auth.needed_for("POST", f"{base}/12/unread"), (12, "view"))
        self.assertIsNone(gateway_auth.needed_for("GET", f"{base}?status=open&page=1"))
        self.assertIsNone(gateway_auth.needed_for("GET", f"{base}/search?q=tan"))
        self.assertIsNone(gateway_auth.needed_for("POST", "/wa/read"))

    def test_levels(self):
        token = token_with_exp(NOW + 3600)
        self.use(FakeChats({1: "reply", 2: "view", 3: "none"}))
        self.assertEqual(gateway_auth.decide_conversation(token, 1, "reply"), 200)
        self.assertEqual(gateway_auth.decide_conversation(token, 2, "view"), 200)
        self.assertEqual(gateway_auth.decide_conversation(token, 2, "reply"), 403)
        self.assertEqual(gateway_auth.decide_conversation(token, 3, "view"), 403)
        # Not in the CRM's copy yet: the tick alone decides (decide() already said yes).
        self.assertEqual(gateway_auth.decide_conversation(token, 4, "reply"), 200)

    def test_an_answer_is_remembered_for_5_minutes(self):
        token = token_with_exp(NOW + 3600)
        fake = self.use(FakeChats({1: "view"}))
        gateway_auth.decide_conversation(token, 1, "view")
        gateway_auth.decide_conversation(token, 1, "reply")
        self.assertEqual(len(fake.calls), 1)
        self.clock = NOW + 301
        gateway_auth.decide_conversation(token, 1, "view")
        self.assertEqual(len(fake.calls), 2)

    def test_a_database_without_the_check_lets_the_tick_decide(self):
        self.use(FakeChats({}, status=404))
        self.assertEqual(gateway_auth.decide_conversation(token_with_exp(NOW + 3600), 1, "reply"), 200)

    def test_supabase_down_is_503_and_not_remembered(self):
        token = token_with_exp(NOW + 3600)
        fake = self.use(FakeChats({}, status=502))
        self.assertEqual(gateway_auth.decide_conversation(token, 1, "reply"), 503)
        gateway_auth.decide_conversation(token, 1, "reply")
        self.assertEqual(len(fake.calls), 2)

    def test_a_refusal_is_403(self):
        self.use(FakeChats({}, status=400))
        self.assertEqual(gateway_auth.decide_conversation(token_with_exp(NOW + 3600), 1, "view"), 403)


class FakeNumbers:
    """Answers whatsapp_numbers and my_whatsapp_inbox_ids like Supabase."""

    def __init__(self, active, given=None, status=200, given_status=200):
        self.active = active  # number name -> inbox id, switched-on numbers only
        self.given = given
        self.status = status
        self.given_status = given_status
        self.calls = []

    def __call__(self, path, token, body=None):
        self.calls.append(path)
        if path.startswith("/rest/v1/whatsapp_numbers?"):
            if self.status != 200:
                return self.status, None
            name = path.rsplit("evolution_instance=eq.", 1)[1]
            return 200, [{"chatwoot_inbox_id": self.active[name]}] if name in self.active else []
        if path == "/rest/v1/rpc/my_whatsapp_inbox_ids":
            return self.given_status, (self.given if self.given_status == 200 else None)
        raise AssertionError(path)


class Numbers(unittest.TestCase):
    def setUp(self):
        gateway_auth._cache.clear()
        self.clock = NOW
        patcher = mock.patch.object(gateway_auth.time, "time", lambda: self.clock)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.token = token_with_exp(NOW + 3600)

    def use(self, fake):
        patcher = mock.patch.object(gateway_auth, "supabase", fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        return fake

    def test_which_number_a_request_names(self):
        self.assertIsNone(gateway_auth.instance_of("/wa/read"))
        self.assertIsNone(gateway_auth.instance_of("/wa/evo/chat/findMessages?x=1"))
        self.assertEqual(gateway_auth.instance_of("/wa/read?instance=eduhero-2"), "eduhero-2")
        self.assertEqual(gateway_auth.instance_of("/wa/connect/qr?a=1&instance=eduhero-3&instance=x"), "eduhero-3")
        self.assertEqual(gateway_auth.instance_of("/wa/read?instance=..%2F..%2Fx"), "../../x")

    def test_a_switched_on_number_for_everyone(self):
        self.use(FakeNumbers({"eduhero-2": 6}, given=None))
        self.assertEqual(gateway_auth.decide_instance(self.token, "eduhero-2"), 200)

    def test_a_number_given_to_this_person(self):
        self.use(FakeNumbers({"eduhero-2": 6}, given=[3, 6]))
        self.assertEqual(gateway_auth.decide_instance(self.token, "eduhero-2"), 200)

    def test_a_number_not_given_to_this_person(self):
        self.use(FakeNumbers({"eduhero-2": 6}, given=[3]))
        self.assertEqual(gateway_auth.decide_instance(self.token, "eduhero-2"), 403)

    def test_an_unknown_or_switched_off_number(self):
        self.use(FakeNumbers({"eduhero": 3}))
        self.assertEqual(gateway_auth.decide_instance(self.token, "eduhero-9"), 403)
        self.assertEqual(gateway_auth.decide_instance(self.token, "mirai-test"), 403)

    def test_a_strange_name_is_refused_without_asking(self):
        fake = self.use(FakeNumbers({}))
        self.assertEqual(gateway_auth.decide_instance(self.token, "../../x"), 403)
        self.assertEqual(gateway_auth.decide_instance(self.token, ""), 403)
        self.assertEqual(fake.calls, [])

    def test_answers_are_remembered(self):
        fake = self.use(FakeNumbers({"eduhero-2": 6}))
        gateway_auth.decide_instance(self.token, "eduhero-2")
        gateway_auth.decide_instance(self.token, "eduhero-2")
        self.assertEqual(len(fake.calls), 2)  # one check: the number + who it is given to
        self.clock = NOW + 301
        gateway_auth.decide_instance(self.token, "eduhero-2")
        self.assertEqual(len(fake.calls), 4)

    def test_supabase_down_is_503_and_not_remembered(self):
        fake = self.use(FakeNumbers({}, status=502))
        self.assertEqual(gateway_auth.decide_instance(self.token, "eduhero-2"), 503)
        gateway_auth.decide_instance(self.token, "eduhero-2")
        self.assertEqual(len(fake.calls), 2)

    def test_an_expired_login_is_401(self):
        self.use(FakeNumbers({}, status=401))
        self.assertEqual(gateway_auth.decide_instance(self.token, "eduhero-2"), 401)


class Gateway(unittest.TestCase):
    """The whole check through HTTP, as Caddy asks it."""

    def setUp(self):
        gateway_auth._cache.clear()
        gateway_auth._levels.clear()
        self.server = gateway_auth.ThreadingHTTPServer(("127.0.0.1", 0), gateway_auth.Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def ask(self, path, uri):
        import urllib.request
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.server.server_address[1]}{path}",
            headers={"Authorization": "Bearer " + token_with_exp(time.time() + 3600), "X-Forwarded-Uri": uri},
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status
        except urllib.error.HTTPError as error:
            return error.code

    def test_number_checks_on_both_doors(self):
        def fake(path, token, body=None):
            if path == "/auth/v1/user":
                return 200, {"id": "u1"}
            if path in ("/rest/v1/rpc/has_permission", "/rest/v1/rpc/is_admin"):
                return 200, True
            return FakeNumbers({"eduhero-2": 6}, given=[3])(path, token, body)

        with mock.patch.object(gateway_auth, "supabase", fake):
            self.assertEqual(self.ask("/verify", "/wa/read"), 200)
            self.assertEqual(self.ask("/verify", "/wa/read?instance=eduhero-2"), 403)
            self.assertEqual(self.ask("/verify", "/wa/read?instance=eduhero-7"), 403)
            self.assertEqual(self.ask("/verify-admin", "/wa/connect/qr?instance=eduhero-9"), 403)
            self.assertEqual(self.ask("/verify-admin", "/wa/numbers"), 200)


if __name__ == "__main__":
    unittest.main()
