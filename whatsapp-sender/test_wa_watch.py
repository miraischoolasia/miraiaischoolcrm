"""Watching the WhatsApp numbers. Run: python -m unittest discover -s whatsapp-sender"""
import datetime
import unittest
from unittest import mock

import wa_watch as w

UTC = datetime.timezone.utc


def kl(day, hour, minute=0):
    return datetime.datetime(2026, 10, day, hour, minute, tzinfo=w.KL)


class Classify(unittest.TestCase):
    def test_states(self):
        # eduhero-2 on 2026-10-20: linked again, the old 401 still in the record -> connected
        self.assertEqual(w.classify({"connectionStatus": "open", "disconnectionReasonCode": 401}), ("connected", None))
        removed = '{"error":{"data":{"tag":"conflict","attrs":{"type":"device_removed"}}}}'
        self.assertEqual(w.classify({"connectionStatus": "close", "disconnectionReasonCode": 401, "disconnectionObject": removed, "ownerJid": "x"}),
                         ("logged_out", "401 device_removed"))
        self.assertEqual(w.classify({"connectionStatus": "close", "disconnectionReasonCode": 440, "ownerJid": "x"})[0], "replaced")
        self.assertEqual(w.classify({"connectionStatus": "close", "disconnectionReasonCode": 403, "ownerJid": "x"})[0], "restricted")
        self.assertEqual(w.classify({"connectionStatus": "close", "disconnectionReasonCode": 428, "ownerJid": "x"})[0], "reconnecting")
        self.assertEqual(w.classify({"connectionStatus": "connecting"})[0], "reconnecting")
        self.assertEqual(w.classify({"connectionStatus": "close", "ownerJid": None}), ("needs_qr", None))
        self.assertEqual(w.classify({"connectionStatus": "close", "ownerJid": "x"}), ("reconnecting", "closed"))


class Quiet(unittest.TestCase):
    def test_only_working_time_counts(self):
        self.assertEqual(w.working_seconds_since(kl(20, 7), kl(20, 10)), 3600)          # 09:00-10:00
        self.assertEqual(w.working_seconds_since(kl(20, 20), kl(21, 10)), 2 * 3600)     # 20-21 and 09-10
        self.assertEqual(w.working_seconds_since(kl(20, 22), kl(21, 8)), 0)             # all night

    def test_two_hours(self):
        self.assertFalse(w.is_quiet(kl(20, 9, 30), kl(20, 8), kl(20, 11)))
        self.assertTrue(w.is_quiet(kl(20, 9, 30), kl(20, 8), kl(20, 11, 31)))
        self.assertFalse(w.is_quiet(None, kl(20, 10), kl(20, 11)))                      # just started watching
        self.assertFalse(w.is_quiet(kl(19, 20, 30), kl(19, 8), kl(20, 10, 0)))          # 0.5 h + 1 h of working time


class Step(unittest.TestCase):
    def number(self):
        return w.Number({"name": "EduHero"}, "eduhero-2", 6, "EduHero WhatsApp 2", kl(20, 9))

    def test_short_drops_are_not_told(self):
        n = self.number()
        self.assertIsNone(n.step("connected", None, 0))
        self.assertIsNone(n.step("reconnecting", None, 10))
        self.assertIsNone(n.step("reconnecting", None, 100))
        self.assertIsNone(n.step("connected", None, 120))        # back within 2 minutes: nothing said

    def test_long_drop_is_told_once_and_recovery_too(self):
        n = self.number()
        n.step("reconnecting", None, 0)
        self.assertEqual(n.step("reconnecting", None, 130), ("bad", "reconnecting"))
        self.assertIsNone(n.step("reconnecting", None, 160))
        self.assertEqual(n.step("connected", None, 200), ("fine", "reconnecting"))

    def test_logout_is_told_at_once_and_reminded(self):
        n = self.number()
        self.assertEqual(n.step("logged_out", "401", 0), ("bad", "logged_out"))
        self.assertIsNone(n.step("logged_out", "401", 600))
        self.assertEqual(n.step("logged_out", "401", w.REMIND_EVERY + 1), ("bad", "logged_out"))

    def test_worse_news_is_told(self):
        n = self.number()
        n.step("reconnecting", None, 0)
        self.assertEqual(n.step("logged_out", "401", 30), ("bad", "logged_out"))


class Telling(unittest.TestCase):
    EVO = {"url": "http://evolution-eduhero:8080", "key": "k"}
    MIRAI_EVO = {"url": "http://evolution-api:8080", "key": "k"}

    def setUp(self):
        self.edu = {"name": "EduHero"}
        self.mirai = {"name": "Mirai"}
        self.numbers = {}
        for key, school, instance, label, evo in (("e1", self.edu, "eduhero", "EduHero WhatsApp", self.EVO),
                                                  ("e2", self.edu, "eduhero-2", "EduHero WhatsApp 2", self.EVO),
                                                  ("m1", self.mirai, "mirai-test", "Mirai WhatsApp", self.MIRAI_EVO)):
            n = w.Number(school, instance, 1, label, kl(20, 9))
            n.status, n.evolution = "connected", evo
            self.numbers[key] = n
        self.sent = []
        self.config = {"alert_phones": ["60100000091", "60100000092", "60100000093"]}

    def fake(self, method, url, headers=None, body=None, timeout=20):
        self.sent.append((url, body))
        return 201, {}

    def tell(self, number, kind, status, now):
        with mock.patch.object(w, "http", self.fake), mock.patch.object(w, "log", lambda *a: None):
            w.notify(self.config, self.numbers, number, kind, status, now)

    def test_a_logout_goes_to_the_three_phones_from_the_schools_other_number(self):
        down = self.numbers["e2"]
        down.status, down.reason = "logged_out", "401 device_removed"
        self.tell(down, "bad", "logged_out", kl(20, 15))
        self.assertEqual([u for u, _ in self.sent], ["http://evolution-eduhero:8080/message/sendText/eduhero"] * 3)
        self.assertEqual([b["number"] for _, b in self.sent], self.config["alert_phones"])
        text = self.sent[0][1]["text"]
        self.assertTrue(text.startswith(w.SYSTEM_ALERT_MARK + "EduHero 的 WhatsApp 号码「EduHero WhatsApp 2」被登出了（15:00）"))
        self.assertIn("下一步：到 CRM → Inbox → Numbers，在「EduHero WhatsApp 2」按「连结」", text)

    def test_the_other_school_sends_when_a_school_has_no_other_number(self):
        down = self.numbers["m1"]
        down.status = "restricted"
        self.tell(down, "bad", "restricted", kl(20, 15))
        self.assertTrue(self.sent[0][0].endswith("/message/sendText/eduhero"))

    def test_nobody_to_send_from(self):
        for n in self.numbers.values():
            n.status = "reconnecting"
        self.tell(self.numbers["e1"], "bad", "reconnecting", kl(20, 15))
        self.assertEqual(self.sent, [])

    def test_night_waits_for_eight_but_a_logout_does_not(self):
        quiet = self.numbers["e1"]
        quiet.status = "reconnecting"
        self.tell(quiet, "bad", "reconnecting", kl(20, 23, 30))
        self.assertEqual(self.sent, [])
        self.assertEqual(quiet.held, ("bad", "reconnecting"))
        down = self.numbers["e2"]
        down.status = "logged_out"
        self.tell(down, "bad", "logged_out", kl(21, 2))
        self.assertEqual(len(self.sent), 3)                      # at once, from the Mirai number (EduHero has none left)
        self.assertTrue(self.sent[0][0].endswith("/mirai-test"))

    def test_a_night_trouble_that_came_right_becomes_one_morning_note(self):
        n = self.numbers["e1"]
        n.status = "reconnecting"
        self.tell(n, "bad", "reconnecting", kl(20, 23, 30))
        n.status = "connected"
        self.tell(n, "fine", "reconnecting", kl(21, 1))
        self.assertEqual(self.sent, [])
        with mock.patch.object(w, "http", self.fake), mock.patch.object(w, "log", lambda *a: None):
            w.morning(self.config, self.numbers, kl(21, 7, 59))
            self.assertEqual(self.sent, [])
            w.morning(self.config, self.numbers, kl(21, 8, 0))
        self.assertEqual(len(self.sent), 3)
        self.assertIn("昨晚曾经断线了，正在自己重连，现在已经恢复正常", self.sent[0][1]["text"])
        self.assertIsNone(n.held)

    def test_recovery_note(self):
        n = self.numbers["e2"]
        self.tell(n, "fine", "logged_out", kl(20, 20, 22))
        self.assertIn("已经恢复正常（20:22）。之前：被登出了。", self.sent[0][1]["text"])

    def test_writes_on_change_and_every_5_minutes(self):
        sent = []

        def fake(method, url, headers=None, body=None, timeout=20):
            sent.append((headers, body))
            return 204, None

        school = {"name": "EduHero", "supabase_url": "https://x.supabase.co", "supabase_key": "sb_publishable_x", "reporter_key": "k"}
        n = w.Number(school, "eduhero", 3, "EduHero WhatsApp", kl(20, 9))
        n.status = "connected"
        with mock.patch.object(w, "http", fake):
            w.report(n, 0)
            w.report(n, 100)
            w.report(n, 301)
            n.status = "logged_out"
            w.report(n, 302)
        self.assertEqual(len(sent), 3)
        self.assertEqual(sent[0][0], {"apikey": "sb_publishable_x"})          # no Bearer with the public key
        self.assertEqual(sent[-1][1]["p_status"], "logged_out")


if __name__ == "__main__":
    unittest.main()
