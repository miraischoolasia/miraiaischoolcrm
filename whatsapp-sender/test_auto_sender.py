"""How long the sender waits between questions. Run: python -m unittest discover -s whatsapp-sender"""
import os
import unittest
from unittest import mock

os.environ.setdefault("SENDER_URL", "https://example.supabase.co/functions/v1/auto-sender")
os.environ.setdefault("SENDER_KEY", "test-key-0123456789")
os.environ.setdefault("CHATWOOT_TOKEN", "test-token")

import auto_sender  # noqa: E402


class StopLoop(Exception):
    pass


class WaitAfter(unittest.TestCase):
    def test_uses_the_wait_the_database_gives(self):
        self.assertEqual(auto_sender.wait_after({"wait_seconds": 1500, "reason": "closed"}, None), 1500)
        self.assertEqual(auto_sender.wait_after({"wait_seconds": 28, "reason": "gap"}, 5), 28)

    def test_keeps_the_wait_between_2_seconds_and_30_minutes(self):
        self.assertEqual(auto_sender.wait_after({"wait_seconds": 50000}, None), 1800)
        self.assertEqual(auto_sender.wait_after({"wait_seconds": 0.5}, None), 2)

    def test_no_usable_wait_means_once_a_minute(self):
        for answer in ({}, {"wait_seconds": None}, {"wait_seconds": 0}, {"wait_seconds": -5},
                       {"wait_seconds": "60"}, {"wait_seconds": True}):
            self.assertEqual(auto_sender.wait_after(answer, None), 60, answer)

    def test_no_wait_given_stays_quick_for_two_minutes_after_a_message(self):
        self.assertEqual(auto_sender.wait_after({}, 3), 15)
        self.assertEqual(auto_sender.wait_after({}, 119), 15)
        self.assertEqual(auto_sender.wait_after({}, 121), 60)


class MainLoop(unittest.TestCase):
    def run_loop(self, answers, sleeps_before_stop):
        sleeps = []

        def fake_sleep(seconds):
            sleeps.append(seconds)
            if len(sleeps) >= sleeps_before_stop:
                raise StopLoop()

        calls = []

        def fake_crm(body):
            calls.append(body)
            if body["action"] == "finish":
                return {"ok": True}
            return answers.pop(0)

        with mock.patch.object(auto_sender, "crm", fake_crm), \
                mock.patch.object(auto_sender, "send", lambda item: ("sent", None)), \
                mock.patch.object(auto_sender, "log", lambda text: None), \
                mock.patch.object(auto_sender.time, "sleep", fake_sleep):
            with self.assertRaises(StopLoop):
                auto_sender.main()
        return sleeps, calls

    def test_sleeps_until_the_hours_open(self):
        sleeps, calls = self.run_loop([{"ok": True, "message": None, "wait_seconds": 1800, "reason": "closed"}], 1)
        self.assertEqual(sleeps, [1800])
        self.assertEqual(calls, [{"action": "claim"}])

    def test_a_message_is_sent_reported_then_the_gap_is_waited(self):
        answers = [
            {"ok": True, "message": {"id": 7, "phone": "60123456789", "message": "hi"}, "wait_seconds": None},
            {"ok": True, "message": None, "wait_seconds": 29, "reason": "gap"},
        ]
        sleeps, calls = self.run_loop(answers, 2)
        self.assertEqual(sleeps, [2, 29])
        self.assertEqual(
            calls,
            [
                {"action": "claim"},
                {"action": "finish", "id": 7, "result": "sent", "error": None},
                {"action": "claim"},
            ],
        )

    def test_older_function_without_a_wait_is_quick_after_a_message(self):
        answers = [
            {"ok": True, "message": {"id": 8, "phone": "60123456789", "message": "hi"}},
            {"ok": True, "message": None},
        ]
        sleeps, _ = self.run_loop(answers, 2)
        self.assertEqual(sleeps, [2, 15])


if __name__ == "__main__":
    unittest.main()
