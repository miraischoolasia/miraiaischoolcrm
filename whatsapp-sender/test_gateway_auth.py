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


if __name__ == "__main__":
    unittest.main()
