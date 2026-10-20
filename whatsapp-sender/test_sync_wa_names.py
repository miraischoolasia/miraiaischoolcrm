"""Names from the school's phones to Chatwoot contacts. Run: python -m unittest discover -s whatsapp-sender"""
import unittest

import sync_wa_names as names


class Names(unittest.TestCase):
    def test_a_number_is_no_name(self):
        for value in ("", None, "60123456789", "+60 12-345 6789", "133333132546168"):
            self.assertEqual(names.good(value), "", value)
        self.assertEqual(names.good("  Mdm   Tan "), "Mdm Tan")

    def test_only_unnamed_contacts_are_renamed(self):
        found = {
            "60111@s.whatsapp.net": ("Mdm Tan", "+60111"),
            "222@lid": ("Mr Lim", "+222"),
            "60333@s.whatsapp.net": ("Ah Seng", "+60333"),
            "60444@s.whatsapp.net": ("Same", "+60444"),
            "999@lid": ("Nobody", "+999"),
        }
        contacts = [
            {"id": 1, "identifier": "60111@s.whatsapp.net", "phone": "+60111", "name": "60111", "wa": None},     # a number: renamed
            {"id": 2, "identifier": "222@lid", "phone": "+222", "name": "Lim (HOA)", "wa": None},               # typed name stays
            {"id": 3, "identifier": None, "phone": "+60333", "name": "", "wa": None},                          # found by phone
            {"id": 4, "identifier": "60444@s.whatsapp.net", "phone": "+60444", "name": "Same", "wa": "Same"},   # nothing new
        ]
        self.assertEqual(names.plan(found, contacts), [(1, "Mdm Tan", True), (2, "Mr Lim", False), (3, "Ah Seng", True)])


if __name__ == "__main__":
    unittest.main()
