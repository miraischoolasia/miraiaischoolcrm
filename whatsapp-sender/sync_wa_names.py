#!/usr/bin/env python3
"""Gives Chatwoot contacts the names the school's phone has for them (WhatsApp address book or business name).

Evolution keeps, per number, the name the phone shows for each person: Contact.pushName (the saved name, else the
business's verified name) and Chat.name. For each person of one Chatwoot account:

  - custom_attributes.whatsapp_name gets that name (the CRM can show it next to its own);
  - the contact's own name is changed only when it is no name at all or just a number (the phone, the hidden id):
    a name a person typed, or one the CRM set from a lead, stays. (The CRM shows a lead's parent name anyway.)

Straight into Chatwoot's database, so nothing is announced. The old values are kept in the table
wa_name_sync_<tag> first; --rollback puts them back.

  python3 sync_wa_names.py --instance eduhero --instance eduhero-2 --account 2 --tag 20261020 --mapping-dir ... [--apply]
"""
import argparse
import json
import re

import import_wa_history as imp

NUMBER_ONLY = re.compile(r"^\+?[0-9 ()\-]*$")


def good(name):
    name = " ".join((name or "").split())
    return name if name and not NUMBER_ONLY.match(name) else ""


def read_names(service, instance, phones):
    """identifier (as the import makes it) -> name the phone has for this person."""
    out, _ = imp.psql(service, "evolution",
        "select json_build_object('jid', k.\"remoteJid\", 'name', k.\"pushName\", 'kind', 'contact') from \"Contact\" k "
        "join \"Instance\" i on i.id = k.\"instanceId\" where i.name = %s "
        "union all select json_build_object('jid', c.\"remoteJid\", 'name', c.name, 'kind', 'chat') from \"Chat\" c "
        "join \"Instance\" i on i.id = c.\"instanceId\" where i.name = %s;" % (imp.quote(instance), imp.quote(instance)))
    names = {}
    for line in out.splitlines():
        entry = json.loads(line)
        who = imp.person_of({"jid": entry["jid"]}, phones)
        name = good(entry["name"])
        if who and name:
            # The contact book's name wins over the chat's.
            if entry["kind"] == "contact" or who[0] not in names:
                names[who[0]] = (name, who[1])
    return names


def plan(names, contacts):
    """[(contact id, name, rename?)]. contacts: [{id, identifier, phone, name, wa}]."""
    by_identifier = {c["identifier"]: c for c in contacts if c["identifier"]}
    by_phone = {}
    for contact in contacts:
        if contact["phone"]:
            by_phone.setdefault(contact["phone"], contact)
    changes = {}
    for identifier, (name, phone) in names.items():
        contact = by_identifier.get(identifier) or by_phone.get(phone)
        if not contact or contact["id"] in changes:
            continue
        rename = not good(contact["name"])
        if rename or contact.get("wa") != name:
            changes[contact["id"]] = (name, rename)
    return [(cid, name, rename) for cid, (name, rename) in sorted(changes.items())]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--instance", action="append", required=True)
    parser.add_argument("--account", type=int, required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--evo-service", default="evo-eduhero-postgres")
    parser.add_argument("--cw-service", default="cw-postgres")
    parser.add_argument("--mapping-dir", action="append", default=[])
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rollback", action="store_true")
    args = parser.parse_args()
    table = "wa_name_sync_" + re.sub(r"[^a-z0-9_]", "_", args.tag.lower())

    if args.rollback:
        out, err = imp.psql(args.cw_service, "chatwoot",
            f"begin; update contacts c set name = b.name, custom_attributes = b.custom_attributes from {table} b where b.id = c.id; "
            f"select count(*) from {table}; commit;")
        imp.log("names put back:", out.strip())
        return

    phones = imp.read_mapping(args.mapping_dir)
    names = {}
    for instance in args.instance:
        for identifier, value in read_names(args.evo_service, instance, phones).items():
            names.setdefault(identifier, value)
    out, _ = imp.psql(args.cw_service, "chatwoot",
        "select json_build_object('id', id, 'identifier', identifier, 'phone', phone_number, 'name', name, "
        "'wa', custom_attributes->>'whatsapp_name') from contacts where account_id = %d;" % args.account)
    contacts = [json.loads(line) for line in out.splitlines() if line.strip()]
    changes = plan(names, contacts)
    imp.log(f"names the phones have: {len(names)} | contacts in account {args.account}: {len(contacts)} | "
            f"to update: {len(changes)} (name changed: {sum(r for _, _, r in changes)}, whatsapp_name only: {sum(not r for _, _, r in changes)})")
    if not args.apply or not changes:
        imp.log("Dry run: nothing written." if not args.apply else "Nothing to do.")
        return
    values = ",\n".join("(%d, %s, %s)" % (cid, imp.quote(name), "true" if rename else "false") for cid, name, rename in changes)
    out, err = imp.psql(args.cw_service, "chatwoot", f"""
begin;
create table if not exists {table} (id bigint primary key, name text, custom_attributes jsonb);
create temp table wa_names (id bigint, name text, rename boolean) on commit drop;
insert into wa_names values
{values};
insert into {table} (id, name, custom_attributes)
select c.id, c.name, c.custom_attributes from contacts c join wa_names w on w.id = c.id on conflict do nothing;
update contacts c
set name = case when w.rename then w.name else c.name end,
    custom_attributes = coalesce(c.custom_attributes, '{{}}'::jsonb) || jsonb_build_object('whatsapp_name', w.name),
    updated_at = now()
from wa_names w where w.id = c.id and c.account_id = {args.account};
commit;
""")
    imp.log("done:", " ".join((out + err).split())[:200])


if __name__ == "__main__":
    main()
