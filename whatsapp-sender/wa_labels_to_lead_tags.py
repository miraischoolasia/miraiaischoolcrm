#!/usr/bin/env python3
"""Turns the WhatsApp Business labels of one number (kept by Evolution) into SQL for the school's CRM database:
the labels become lead tags (lead_options kind 'tag'; a tag of the same name, in any case, is used as it is), and
each lead whose chat carries a label gets that tag. A chat without a lead gets no lead for it.

Which lead is a chat's: lead_channels.chatwoot_contact_id (the Chatwoot contact of the chat), or, for a chat with a
phone number, a lead with that phone. Labels without a name (removed on the phone) are left out. The colour is the
one the CRM already shows for that WhatsApp label (labelColor in src/lib/waActions.ts).

Runs on the server (it reads Evolution's and Chatwoot's databases) and prints the SQL; the SQL is run on the CRM's
database by whoever may (it keeps the leads' old tags in a table first, so it can be undone):

  python3 wa_labels_to_lead_tags.py --instance eduhero-2 --account 2 --mapping-dir <folder> ... > lead-tags.sql
"""
import argparse
import collections
import json
import sys

import import_wa_history as imp

# The colours the CRM gives WhatsApp labels (src/lib/waActions.ts, labelColor).
LABEL_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#7c3aed", "#0d9488", "#dc2626", "#4b5563", "#ea580c", "#0891b2"]


def label_color(index):
    try:
        return LABEL_COLORS[abs(int(index)) % len(LABEL_COLORS)]
    except (TypeError, ValueError):
        return LABEL_COLORS[0]


def clean(name):
    return " ".join((name or "").split())[:60]


def read(evo_service, cw_service, instance, account, phones):
    out, _ = imp.psql(evo_service, "evolution",
        "select json_build_object('id', l.\"labelId\", 'name', l.name, 'color', l.color) from \"Label\" l "
        "join \"Instance\" i on i.id = l.\"instanceId\" where i.name = %s;" % imp.quote(instance))
    labels = {}
    for line in out.splitlines():
        label = json.loads(line)
        if clean(label["name"]):
            labels[str(label["id"])] = (clean(label["name"]), label_color(label["color"]))
    out, _ = imp.psql(evo_service, "evolution",
        "select json_build_object('jid', c.\"remoteJid\", 'labels', c.labels) from \"Chat\" c "
        "join \"Instance\" i on i.id = c.\"instanceId\" where i.name = %s and jsonb_array_length(coalesce(c.labels, '[]')) > 0;"
        % imp.quote(instance))
    chats = [json.loads(line) for line in out.splitlines() if line.strip()]
    out, _ = imp.psql(cw_service, "chatwoot",
        "select json_build_object('id', id, 'identifier', identifier, 'phone', phone_number) from contacts where account_id = %d;" % account)
    by_identifier, by_phone = {}, {}
    for line in out.splitlines():
        contact = json.loads(line)
        if contact["identifier"]:
            by_identifier[contact["identifier"]] = contact["id"]
        if contact["phone"]:
            by_phone.setdefault(contact["phone"], contact["id"])
    return labels, chats, by_identifier, by_phone


def plan(labels, chats, by_identifier, by_phone, phones):
    """[(contact id, phone digits or None, label name, colour)] and counts."""
    rows, counts = [], collections.Counter()
    for chat in chats:
        who = imp.person_of({"jid": chat["jid"]}, phones)
        if who is None:
            counts["group or status"] += 1
            continue
        identifier, phone = who
        contact = by_identifier.get(identifier) or by_identifier.get(chat["jid"]) or by_phone.get(phone)
        named = [labels[str(i)] for i in chat.get("labels") or [] if str(i) in labels]
        if not named:
            counts["only unnamed labels"] += 1
            continue
        if contact is None:
            counts["no Chatwoot contact"] += 1
            continue
        counts["chats with a named label"] += 1
        digits = imp.digits(identifier) if identifier.endswith("@s.whatsapp.net") else None
        for name, color in named:
            rows.append((contact, digits, name, color))
    return rows, counts


def sql(rows, tag, labels_used):
    values = ",\n".join("  (%d, %s, %s, %s)" % (c, imp.quote(p) if p else "null", imp.quote(n), imp.quote(col)) for c, p, n, col in rows)
    backup = "wa_label_import_%s" % tag.replace("-", "_")
    return f"""-- Lead tags from the WhatsApp labels ({tag}). Labels: {", ".join(sorted(labels_used))}
-- Run once on the CRM database. Undo: see the end of this file.
begin;

create temp table wa_labels (contact_id bigint, phone text, label text, color text) on commit drop;
insert into wa_labels values
{values};

-- Kept so it can be undone: every new tag, and every changed lead's tags before.
create table if not exists public.{backup}_tags (id bigint primary key);
create table if not exists public.{backup}_leads (id bigint primary key, tag_ids bigint[] not null);
alter table public.{backup}_tags enable row level security;
alter table public.{backup}_leads enable row level security;

-- Tags that are not there yet (a tag of the same name, in any case, hidden or not, is the same tag).
with made as (
  insert into public.lead_options (kind, label, color)
  select distinct on (lower(btrim(w.label))) 'tag', btrim(w.label), w.color
  from wa_labels w
  where not exists (select 1 from public.lead_options o where o.kind = 'tag' and lower(btrim(o.label)) = lower(btrim(w.label)))
  order by lower(btrim(w.label))
  returning id
)
insert into public.{backup}_tags select id from made on conflict do nothing;

-- Each lead of a labelled chat: by its chat (lead_channels) or, for a phone chat, by its phone.
create temp table wa_lead_tags on commit drop as
select distinct l.id as lead_id, o.id as tag_id
from wa_labels w
join public.lead_options o on o.kind = 'tag' and o.is_active and lower(btrim(o.label)) = lower(btrim(w.label))
join public.leads l on l.id in (select lc.lead_id from public.lead_channels lc where lc.chatwoot_contact_id = w.contact_id)
  or (w.phone is not null and regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') in (w.phone, regexp_replace(w.phone, '^60', '0')));

insert into public.{backup}_leads (id, tag_ids)
select l.id, l.tag_ids from public.leads l where l.id in (select lead_id from wa_lead_tags)
on conflict do nothing;

update public.leads l
set tag_ids = (select array_agg(distinct t order by t) from unnest(l.tag_ids || array(select x.tag_id from wa_lead_tags x where x.lead_id = l.id)) t)
where l.id in (select lead_id from wa_lead_tags)
  and not (array(select x.tag_id from wa_lead_tags x where x.lead_id = l.id) <@ l.tag_ids);

select (select count(*) from public.{backup}_tags) as tags_made,
       (select count(distinct lead_id) from wa_lead_tags) as leads_tagged,
       (select count(*) from wa_lead_tags) as tags_put_on;
commit;

-- Undo (run on its own):
-- begin;
-- update public.leads l set tag_ids = b.tag_ids from public.{backup}_leads b where b.id = l.id;
-- update public.leads set tag_ids = array(select t from unnest(tag_ids) t where t not in (select id from public.{backup}_tags))
--   where tag_ids && array(select id from public.{backup}_tags);
-- delete from public.lead_options where id in (select id from public.{backup}_tags);
-- drop table public.{backup}_leads; drop table public.{backup}_tags;
-- commit;
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--instance", required=True)
    parser.add_argument("--account", type=int, required=True)
    parser.add_argument("--tag", default="")
    parser.add_argument("--evo-service", default="evo-eduhero-postgres")
    parser.add_argument("--cw-service", default="cw-postgres")
    parser.add_argument("--mapping-dir", action="append", default=[])
    args = parser.parse_args()
    phones = imp.read_mapping(args.mapping_dir)
    labels, chats, by_identifier, by_phone = read(args.evo_service, args.cw_service, args.instance, args.account, phones)
    rows, counts = plan(labels, chats, by_identifier, by_phone, phones)
    used = {name for _, _, name, _ in rows}
    print(f"-- labels with a name: {len(labels)}; used: {len(used)}; chats with labels: {len(chats)}; {dict(counts)}; "
          f"label-to-chat pairs: {len(rows)}", file=sys.stderr)
    for name, count in collections.Counter(n for _, _, n, _ in rows).most_common():
        print(f"--   {name}: {count} chats", file=sys.stderr)
    if rows:
        print(sql(rows, args.tag or args.instance, used))


if __name__ == "__main__":
    main()
