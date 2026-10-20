"""Bringing a number's older WhatsApp chats into its inbox. Run: python -m unittest discover -s whatsapp-sender"""
import json
import os
import tempfile
import unittest

import import_wa_history as imp

P = imp.PLACEHOLDER


def row(wa_id, jid, ts, msg, from_me=False, push=None, alt=None, cw=None):
    return {"id": wa_id, "jid": jid, "alt": alt, "fromMe": from_me, "push": push, "ts": ts, "msg": msg, "cw": cw}


class Words(unittest.TestCase):
    def test_text_kinds(self):
        self.assertEqual(imp.text_of({"conversation": "hello"}), "hello")
        self.assertEqual(imp.text_of({"extendedTextMessage": {"text": "with a link"}}), "with a link")
        self.assertEqual(imp.text_of({"ephemeralMessage": {"message": {"conversation": "kept"}}}), "kept")
        self.assertEqual(imp.text_of({"interactiveMessage": {"body": {"text": "pick one"}}}), "pick one")
        self.assertEqual(imp.text_of({"buttonsResponseMessage": {"selectedDisplayText": "Yes"}}), "Yes")
        self.assertEqual(imp.text_of({"contactMessage": {"displayName": "Mdm Tan"}}), "[联络人] Mdm Tan")
        self.assertTrue(imp.text_of({"pollCreationMessageV2": {"name": "Day?", "options": [{"optionName": "Sat"}]}}).startswith("[投票] Day?"))

    def test_files_become_the_placeholder_with_their_caption(self):
        self.assertEqual(imp.text_of({"imageMessage": {"url": "x"}}), P)
        self.assertEqual(imp.text_of({"audioMessage": {"seconds": 5}}), P)
        self.assertEqual(imp.text_of({"videoMessage": {"caption": "class video"}}), P + "\nclass video")
        self.assertEqual(imp.text_of({"documentWithCaptionMessage": {"message": {"documentMessage": {"caption": "notes"}}}}), P + "\nnotes")
        self.assertEqual(imp.text_of({"associatedChildMessage": {"message": {"imageMessage": {}}}}), P)

    def test_not_a_message(self):
        for message in ({}, {"protocolMessage": {"type": 14}}, {"reactionMessage": {"text": "👍"}}, {"albumMessage": {}},
                        {"messageHistoryNotice": {}}, {"conversation": "   "}):
            self.assertIsNone(imp.text_of(message), message)

    def test_protocol(self):
        self.assertEqual(imp.protocol_of({"protocolMessage": {"type": "REVOKE", "key": {"id": "A"}}}), ("revoke", "A", None))
        self.assertEqual(imp.protocol_of({"protocolMessage": {"type": 14, "key": {"id": "B"}, "editedMessage": {"conversation": "new"}}}),
                         ("edit", "B", "new"))
        self.assertIsNone(imp.protocol_of({"protocolMessage": {"type": 3, "key": {"id": "C"}}}))


class People(unittest.TestCase):
    def test_who(self):
        self.assertEqual(imp.person_of({"jid": "60123456789@s.whatsapp.net"}, {}), ("60123456789@s.whatsapp.net", "+60123456789"))
        self.assertEqual(imp.person_of({"jid": "13333@lid"}, {}), ("13333@lid", "+13333"))
        self.assertEqual(imp.person_of({"jid": "13333@lid"}, {"13333": "60111"}), ("60111@s.whatsapp.net", "+60111"))
        self.assertEqual(imp.person_of({"jid": "13333@lid", "alt": "60122@s.whatsapp.net"}, {}), ("60122@s.whatsapp.net", "+60122"))
        for jid in ("1203@g.us", "status@broadcast", "1@newsletter", ""):
            self.assertIsNone(imp.person_of({"jid": jid}, {}))

    def test_mapping_files(self):
        with tempfile.TemporaryDirectory() as folder:
            json.dump("60177777777", open(os.path.join(folder, "lid-mapping-555_reverse.json"), "w"))
            json.dump("60188888888", open(os.path.join(folder, "lid-mapping-60188888888.json"), "w"))  # the other direction
            json.dump("bad", open(os.path.join(folder, "lid-mapping-666_reverse.json"), "w"))
            self.assertEqual(imp.read_mapping([folder, "/no/such/folder"]), {"555": "60177777777"})


class Chats(unittest.TestCase):
    def test_grouping_order_and_what_is_left_out(self):
        rows = [
            row("2", "111@lid", 200, {"conversation": "second"}, from_me=True),
            row("1", "111@lid", 100, {"conversation": "first"}, push="Mdm Lee"),
            row("1", "111@lid", 100, {"conversation": "first"}, push="Mdm Lee"),           # the same message twice
            row("3", "111@lid", 300, {"imageMessage": {}}, push="Mdm Lee"),
            row("4", "111@lid", 400, {"conversation": "oops"}),
            row("5", "111@lid", 500, {"protocolMessage": {"type": 0, "key": {"id": "4"}}}),  # 4 taken back
            row("6", "111@lid", 600, {"conversation": "typo"}, from_me=True),
            row("7", "111@lid", 700, {"protocolMessage": {"type": 14, "key": {"id": "6"}, "editedMessage": {"conversation": "fixed"}}}),
            row("8", "999@g.us", 800, {"conversation": "group"}),
            row("9", "222@s.whatsapp.net", 900, {"conversation": "live"}, cw=55),         # Evolution sent it already
            row("10", "222@s.whatsapp.net", 950, {"conversation": "known"}),
            row("11", "222@s.whatsapp.net", 990, {"conversation": "old one"}, push="Mr Ng"),
        ]
        chats, skipped = imp.build_chats(rows, {}, known_ids={"10"})
        lee = chats["111@lid"]
        self.assertEqual(lee["name"], "Mdm Lee")
        self.assertEqual([(m["id"], m["incoming"], m["text"]) for m in lee["messages"]],
                         [("1", True, "first"), ("2", False, "second"), ("3", True, P), ("6", False, "fixed")])
        self.assertEqual([m["text"] for m in chats["222@s.whatsapp.net"]["messages"]], ["old one"])
        self.assertEqual(skipped, {"group or status": 1, "already in the inbox": 2, "not a message": 2, "taken back": 1, "repeated": 1})

    def test_the_chat_evolution_used_is_kept(self):
        rows = [
            row("1", "777@lid", 100, {"conversation": "old"}),
            row("2", "777@lid", 200, {"conversation": "live"}, cw=9, ),
        ]
        rows[1]["conv"] = 1234
        chats, _ = imp.build_chats(rows, {}, set())
        self.assertEqual(chats["777@lid"]["conversation"], 1234)
        self.assertIn("where c.id = 1234 and", imp.chat_sql("777@lid", chats["777@lid"], 2, 3, "t"))

    def test_a_phone_named_next_to_a_hidden_id_is_used(self):
        rows = [row("1", "888@lid", 100, {"conversation": "hi"}), row("2", "888@lid", 200, {"conversation": "again"}, alt="60199@s.whatsapp.net")]
        chats, _ = imp.build_chats(rows, {}, set())
        self.assertEqual(list(chats), ["60199@s.whatsapp.net"])

    def test_messages_after_the_gap_stay_new(self):
        rows = [row("1", "60111@s.whatsapp.net", 1000, {"conversation": "old"}, push="A"),
                row("2", "60111@s.whatsapp.net", 2000, {"conversation": "while away"}, push="A")]
        chats, _ = imp.build_chats(rows, {}, set())
        sql = imp.chat_sql("60111@s.whatsapp.net", chats["60111@s.whatsapp.net"], 2, 6, "t", live_after=1500)
        self.assertIn("values (2, 6, 0, cid", sql)                       # a new chat is open
        self.assertIn(imp.stamp(1500) + ", now(),", sql)                 # read up to the gap only
        self.assertIn("status = 0", sql)                                 # an existing chat reopens
        self.assertIn("'epoch'::timestamp), " + imp.stamp(1000) + ")", sql)
        quiet = imp.chat_sql("60111@s.whatsapp.net", chats["60111@s.whatsapp.net"], 2, 6, "t")
        self.assertIn("values (2, 6, 1, cid", quiet)
        self.assertIn("status = status", quiet)

    def test_sql_keeps_quotes_and_marks_everything(self):
        rows = [row("A'1", "111@lid", 1760000000, {"conversation": "it's $import$ here"}, push="O'Neil"),
                row("B", "111@lid", 1760000100, {"conversation": "ok"}, from_me=True)]
        built, _ = imp.build_chats(rows, {}, set())
        sql = imp.chat_sql("111@lid", built["111@lid"], 2, 6, "t-1")
        self.assertIn("'O''Neil'", sql)
        self.assertIn("'WAID:A''1'", sql)
        self.assertIn("imported_history", sql)
        self.assertEqual(sql.count("$import$"), 2)  # only the two ends of the block
        self.assertNotIn("$import$ here", built["111@lid"]["messages"][0]["text"])
        self.assertIn("2025-10-09 08:53:20", sql)  # UTC, as Chatwoot keeps time


if __name__ == "__main__":
    unittest.main()
