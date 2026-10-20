"""WhatsApp labels to lead tags. Run: python -m unittest discover -s whatsapp-sender"""
import unittest

import wa_labels_to_lead_tags as tags


class Plan(unittest.TestCase):
    def test_chats_to_contacts_and_names(self):
        labels = {"24": ("XueLing", "#7c3aed"), "21": ("PENDING", "#2563eb")}
        chats = [
            {"jid": "111@lid", "labels": ["24", "21"]},
            {"jid": "222@lid", "labels": ["20"]},                       # only a label without a name
            {"jid": "333@lid", "labels": ["24"]},                       # mapped to a phone
            {"jid": "60123@s.whatsapp.net", "labels": ["21"]},
            {"jid": "999@lid", "labels": ["24"]},                       # no contact in Chatwoot
            {"jid": "1203@g.us", "labels": ["24"]},
        ]
        by_identifier = {"111@lid": 1, "60177@s.whatsapp.net": 3, "60123@s.whatsapp.net": 4}
        rows, counts = tags.plan(labels, chats, by_identifier, {}, {"333": "60177"})
        self.assertEqual(rows, [(1, None, "XueLing", "#7c3aed"), (1, None, "PENDING", "#2563eb"),
                                (3, "60177", "XueLing", "#7c3aed"), (4, "60123", "PENDING", "#2563eb")])
        self.assertEqual(dict(counts), {"chats with a named label": 3, "only unnamed labels": 1, "no Chatwoot contact": 1, "group or status": 1})

    def test_colours_follow_the_crm(self):
        self.assertEqual(tags.label_color(0), "#2563eb")
        self.assertEqual(tags.label_color("13"), "#db2777")
        self.assertEqual(tags.label_color(None), "#2563eb")

    def test_sql_quotes_names(self):
        text = tags.sql([(1, None, "Mdm's", "#2563eb")], "eduhero-2-20261020", {"Mdm's"})
        self.assertIn("(1, null, 'Mdm''s', '#2563eb')", text)
        self.assertIn("wa_label_import_eduhero_2_20261020_leads", text)


if __name__ == "__main__":
    unittest.main()
