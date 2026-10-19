"""Build the EduHero 2026 timetable import from the "2026 FB GROUP ZOOM LINK SHEET".

Reads the Sheet (exported as .xlsx) and a snapshot of EduHero's classrooms and
teachers (db_snapshot.sql run with `-o json`), matches every lesson cell to a
CRM class + teacher, and writes:

  <out>/import_schedules.sql   weekly schedules + FB group links (no Zoom secrets)
  <out>/rollback.sql           removes exactly what the import added
  <out>/preview.csv            one row per lesson, for checking by eye
  <private>/zoom_private.sql   fixed Zoom links (they carry the passcode) and the
                               teacher -> Zoom account e-mails. NEVER put this file
                               in the repo, docs or a chat message.

Usage (run with python -I, the Sheet is untrusted data):
  python -I build_import.py sheet.xlsx db_snapshot.json <out_dir> <private_dir>
"""
import csv
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

MARKER = 'import:eduhero-timetable-2026'
START_RECUR = '2026-10-19'  # the boss: "今天开始" (2026-10-19)
END_RECUR = '2026-12-31'    # 2027 has its own timetable
NEW_LEVEL = ('升级班', 25)   # program level for the upgrade classes, between 双语班 (20) and 备战班 (30)

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}

# Sheet spelling -> CRM subject (classrooms are named "<SUBJECT> <Form n|Year n>").
SUBJECTS = {'SCI': 'SCI', 'SAINS': 'SCI', 'SC': 'SCI', 'BIO': 'BIO', 'BIOLOGY': 'BIO', 'PHY': 'PHY',
            'PHYSICS': 'PHY', 'CHEMI': 'CHE', 'CHE': 'CHE', 'PN': 'PER', 'PER': 'PER', 'ACC': 'ACC',
            'AKAUN': 'ACC', 'EKO': 'EKO', 'RBT': 'RBT', 'GEO': 'GEO', 'BMK': 'BMK', 'BMP': 'BMP',
            'BIK': 'BIK', 'BIP': 'BIP', 'BC': 'BC', 'MM': 'MM', 'AM': 'AM', 'SEJ': 'SEJ'}
# Sheet name -> EduHero teachers.id (checked against My Team 2026-10-19).
TEACHERS = {'ANGELINE': 26, 'JESSIE': 13, 'REGINA': 24, 'ANGIE': 9, 'DANNY': 28, 'JOEY': 52,
            'MADELINE': 27, 'MAD': 27, 'ABBY': 42, 'JENNY': 55, 'QING': 12, 'HENRY': 14, 'TAN': 41,
            'HAPPY': 51, 'KIWI': 35, 'JACK': 38, 'TINA': 23, 'SOPHIA': 29, 'KC': 15, 'AUDREY': 30,
            'RACHEL': 10, 'MELISSA': 21, 'HANSON': 33, 'KEE': 25, 'IVAN': 48, 'LIJIA': 50,
            'EUNICE': 17}
# The Sheet calls Ms Eunice by her surname; the boss wants "Ms Eunice" everywhere.
SHEET_NAMES = [(re.compile(r'\bTEACHER\s+ANG\b', re.I), 'MS EUNICE')]
# Teacher -> column of the Sheet's ZOOM ACC tab (A1 = column B ... A10 = column K).
# A6-A10 are Superstar 1-5. Superstar 3 (A8) and Superstar 5 (A10) belong to Mirai (Milo, Ho Jia Hui)
# and the two CRMs cannot see each other's meetings, so EduHero never uses them: Ms Madeline (Sheet: A8)
# and Ms Tina (Sheet: A10) move to A3, the only account where both still fit (max 2 at a time).
MIRAI_ONLY = {8, 10}
ZOOM_ACCOUNT = {'ANGELINE': 1, 'SOPHIA': 1, 'HANSON': 1, 'IVAN': 1, 'KIWI': 2, 'REGINA': 2, 'JENNY': 2,
                'JACK': 3, 'ANGIE': 4, 'LIJIA': 4, 'DANNY': 4, 'RACHEL': 5, 'ABBY': 5, 'QING': 5,
                'JOEY': 6, 'MELISSA': 6, 'HAPPY': 7, 'HENRY': 7, 'MADELINE': 3, 'MAD': 3,
                'AUDREY': 9, 'JESSIE': 9, 'TINA': 3}
PER_HOST = 2  # Zoom lets one account run 2 meetings at once
assert not MIRAI_ONLY & set(ZOOM_ACCOUNT.values()), 'Superstar 3/5 are Mirai-only'
DAYS = {'星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4, '星期五': 5, '星期六': 6}
WEEKDAY_SLOTS = {2: ('08:15', '09:30'), 3: ('09:40', '10:55'), 4: ('15:45', '17:00'),
                 5: ('17:15', '18:30'), 6: ('19:00', '20:15'), 7: ('20:30', '21:45')}
SATURDAY_SLOTS = {2: ('11:00', '12:15'), 3: ('11:30', '12:45'), 4: ('13:30', '14:45'),
                  5: ('15:00', '16:15'), 6: ('16:30', '17:45'), 7: ('19:00', '20:15'), 8: ('20:30', '21:45')}
LABEL = re.compile(r'^\s*(2026\s+)?(Y|F)\d', re.I)


def read_xlsx(path):
    book = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in book.namelist():
        for item in ET.fromstring(book.read('xl/sharedStrings.xml')).findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in item.iter('{%s}t' % NS['m'])))
    workbook = ET.fromstring(book.read('xl/workbook.xml'))
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(book.read('xl/_rels/workbook.xml.rels'))}
    sheets = {}
    for sheet in workbook.find('m:sheets', NS):
        target = rels[sheet.get('{%s}id' % NS['r'])].lstrip('/')
        target = target if target.startswith('xl/') else 'xl/' + target
        rows = defaultdict(dict)
        for cell in ET.fromstring(book.read(target)).iter('{%s}c' % NS['m']):
            ref = re.match(r'([A-Z]+)(\d+)', cell.get('r'))
            col = 0
            for ch in ref.group(1):
                col = col * 26 + ord(ch) - 64
            value = cell.find('m:v', NS)
            if cell.get('t') == 's' and value is not None:
                text = shared[int(value.text)]
            elif cell.get('t') == 'inlineStr':
                text = ''.join(t.text or '' for t in cell.iter('{%s}t' % NS['m']))
            else:
                text = value.text if value is not None else None
            if text:
                rows[int(ref.group(2))][col] = text
        sheets[sheet.get('name')] = rows
    return sheets


def to24(text):
    m = re.match(r'(\d{1,2})[.:](\d{2})\s*([ap]m)', text.strip().lower())
    hour = int(m.group(1)) + (12 if m.group(3) == 'pm' and m.group(1) != '12' else 0)
    return f'{hour:02d}:{m.group(2)}'


def lessons(rows):
    """Every lesson cell of the main timetable with its FB and Zoom cells below it."""
    found = []
    ordered = sorted(rows)
    day_rows = [(r, DAYS[rows[r][1].strip()]) for r in ordered if rows[r].get(1, '').strip() in DAYS]
    for index, (day_row, dow) in enumerate(day_rows):
        last = day_rows[index + 1][0] if index + 1 < len(day_rows) else 10 ** 6
        slots = SATURDAY_SLOTS if dow == 6 else WEEKDAY_SLOTS
        for col in range(2, 9):
            slot = slots.get(col)
            cells = [r for r in ordered if day_row <= r < last and col in rows[r]]
            for pos, r in enumerate(cells):
                text = rows[r][col].strip()
                if r != day_row and re.match(r'^\d{1,2}[.:]\d{2}\s*[AP]M\s*-', text, re.I):
                    start, end = text.split('-')
                    slot = (to24(start), to24(end))  # Saturday column C changes time part-way down
                    continue
                if (r == day_row and dow == 6) or '\n' in text or 'http' in text or not LABEL.match(text):
                    continue
                fb = zoom = None
                for below in cells[pos + 1:pos + 3]:
                    other = rows[below][col]
                    if LABEL.match(other.strip()) and '\n' not in other.strip():
                        break
                    if 'facebook' in other and fb is None:
                        fb = re.search(r'\S*facebook\.com/groups/[^\s/]+', other).group(0)
                    elif zoom is None and re.search(r'zoom|Meeting ID|ID:|会议号', other, re.I):
                        zoom = other
                label = re.sub(r'\s+', ' ', text)
                for pattern, name in SHEET_NAMES:
                    label = pattern.sub(name, label)
                found.append({'row': r, 'col': col, 'dow': dow, 'start': slot[0], 'end': slot[1],
                              'label': label, 'fb': fb, 'zoom': zoom})
    return found


def match(lesson, classrooms, subject_ids):
    label = lesson['label'].upper().replace('双语', ' 双语 ').replace('(', ' ').replace(')', ' ')
    label = re.sub(r'^2026\s+', '', label)
    label = re.sub(r'\b(MON|TUE|WED|THU|FRI|SAT)\b.*$', '', label)
    tokens = label.split()
    grade = ('Year ' if tokens[0][0] == 'Y' else 'Form ') + tokens[0][1]
    upgrade, i = None, 1
    if tokens[1] == 'UP':
        upgrade, i = ('Year ' if tokens[2][0] == 'Y' else 'Form ') + tokens[2][1], 3
    subject = SUBJECTS.get(tokens[i])
    rest = [t for t in tokens[i + 1:] if t != '双语']
    bilingual = '双语' in tokens[i + 1:]
    key = rest[-1] if rest else ''
    if key == 'JIA' and len(rest) > 1 and rest[-2] == 'LI':
        key = 'LIJIA'
    teacher_id = TEACHERS.get(key, '?')
    reasons = []
    name = new_class = None
    if subject:
        # Upgrade lessons ("Y6 UP F1 MM") belong to the pupils' own grade: their
        # class of that subject, else a new "<subject> 升级班 <grade>" class.
        # Bilingual science goes to "SCI (双语) <grade>" like Form 1/2/4/5.
        name = f'SCI (双语) {grade}' if bilingual and subject == 'SCI' else f'{subject} {grade}'
        if name not in classrooms:
            if upgrade:
                name, level = f'{subject} 升级班 {grade}', NEW_LEVEL[0]
            elif bilingual and subject == 'SCI':
                level = '双语班'
            else:
                level = None
                reasons.append(f'CRM has no class "{name}"')
            if level and name not in classrooms:
                new_class = {'name': name, 'age_group': grade, 'level': level,
                             'subject_id': subject_ids.get(subject), 'teacher_id': teacher_id}
    else:
        reasons.append(f'unknown subject {tokens[i]}')
    if teacher_id == '?':
        reasons.append(f'unknown teacher {key}')
    elif teacher_id is None:
        reasons.append(f'no CRM login for teacher {key}')
    return {**lesson, 'grade': grade, 'upgrade': upgrade, 'subject_raw': tokens[i], 'subject': subject,
            'bilingual': bilingual, 'teacher_key': key,
            'teacher_id': teacher_id if isinstance(teacher_id, int) else None,
            'classroom_id': classrooms[name]['id'] if name in classrooms else None,
            'classroom': name if not reasons else None, 'new_class': new_class,
            'zoom_account': ZOOM_ACCOUNT.get(key), 'reasons': reasons, 'ok': not reasons}


def fb_url(url):
    return url if url.startswith('http') else 'https://' + url


def q(text):
    return "'" + text.replace("'", "''") + "'"


def write_import(out, matched):
    ok = [m for m in matched if m['ok']]
    new_classes = {}
    for m in ok:
        if m['new_class'] and m['new_class']['name'] not in new_classes:
            new_classes[m['new_class']['name']] = m['new_class']
    class_rows = ',\n'.join(
        f"  ({q(c['name'])}, {q(c['age_group'])}, {q(c['level'])}, {c['teacher_id']}, {c['subject_id'] or 'null'})"
        for c in new_classes.values())
    values = ',\n'.join(
        f"  ({m['row']}, {m['col']}, {q(m['classroom'])}, {m['teacher_id']}, {m['dow']}, "
        f"time '{m['start']}', time '{m['end']}', {q(m['label'])}, {q(fb_url(m['fb'])) if m['fb'] else 'null'})"
        for m in ok)
    new_class_sql = f"""-- Classes the timetable needs that EduHero does not have yet (boss approved 2026-10-19).
insert into public.program_levels (name, sort_order)
values ({q(NEW_LEVEL[0])}, {NEW_LEVEL[1]})
on conflict (name) do nothing;

insert into public.classrooms (name, age_group, program_level, teacher_id, status, category, subject_id, notes)
select v.name, v.age_group, v.program_level, v.teacher_id, 'active', 'regular', v.subject_id, '{MARKER}'
from (values
{class_rows}
) as v(name, age_group, program_level, teacher_id, subject_id)
where not exists (select 1 from public.classrooms c where c.name = v.name);
""" if new_classes else ''
    (out / 'import_schedules.sql').write_text(f"""-- EduHero 2026 weekly timetable -> schedules. EduHero database ONLY.
-- Made by build_import.py from the Sheet: {len(ok)} of {len(matched)} lessons, {len(new_classes)} new classes.
-- Needs migration 20261025200000_schedule_links.sql first (schedules.fb_group_url / zoom_link).
-- Safe to run twice: a class or lesson that already exists (same class, teacher, weekday, start time)
-- is not added again; an existing lesson only gets its FB link filled in. rollback.sql removes what this added.
begin;

do $$
begin
  if not exists (select 1 from public.classrooms where id = 80 and name = 'SEJ Form 5')
     or not exists (select 1 from public.teachers where id = 38 and full_name = 'Mr Jack') then
    raise exception 'This is not the EduHero database - stopped.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'schedules' and column_name = 'fb_group_url') then
    raise exception 'Push migration 20261025200000_schedule_links.sql first (schedules.fb_group_url is missing).';
  end if;
end $$;

{new_class_sql}
create temporary table timetable_import (
  sheet_row int, sheet_col int, classroom_name text, teacher_id bigint, day_of_week smallint,
  start_time time, end_time time, title text, fb_group_url text, classroom_id bigint
) on commit drop;

insert into timetable_import (sheet_row, sheet_col, classroom_name, teacher_id, day_of_week,
                              start_time, end_time, title, fb_group_url)
values
{values};

update timetable_import i set classroom_id = c.id
from public.classrooms c
where c.name = i.classroom_name;

do $$
begin
  if exists (select 1 from timetable_import where classroom_id is null) then
    raise exception 'A class in the timetable is missing: %',
      (select string_agg(distinct classroom_name, ', ') from timetable_import where classroom_id is null);
  end if;
end $$;

-- Every timetable teacher is listed on the class (Class > Teachers).
insert into public.classroom_teachers (classroom_id, teacher_id)
select distinct classroom_id, teacher_id from timetable_import
on conflict do nothing;

-- Lessons that already exist only get the FB link (never overwrite one somebody typed).
update public.schedules s
set fb_group_url = i.fb_group_url
from timetable_import i
where s.classroom_id = i.classroom_id and s.teacher_id = i.teacher_id and s.day_of_week = i.day_of_week
  and s.start_time = i.start_time and s.event_type = 'regular' and s.status = 'active'
  and s.fb_group_url is null;

-- A lesson counts from the moment this runs (Malaysia time), never earlier than {START_RECUR}: one that
-- already started today begins tomorrow, so its first class is next week and today's class it has
-- already taught outside the CRM is never owed attendance.
insert into public.schedules (teacher_id, classroom_id, title, event_type, recurrence_type, day_of_week,
                              start_time, end_time, start_recur, end_recur, status, notes, fb_group_url)
select i.teacher_id, i.classroom_id, i.title, 'regular', 'weekly', i.day_of_week,
       i.start_time, i.end_time,
       case
         when clock.kl::date >= date '{START_RECUR}'
          and i.day_of_week = extract(dow from clock.kl)::int
          and i.start_time <= clock.kl::time
           then clock.kl::date + 1
         else greatest(date '{START_RECUR}', clock.kl::date)
       end,
       date '{END_RECUR}', 'active', '{MARKER}', i.fb_group_url
from timetable_import i
cross join (select timezone('Asia/Kuala_Lumpur', now()) as kl) as clock
where not exists (
  select 1 from public.schedules s
  where s.classroom_id = i.classroom_id and s.teacher_id = i.teacher_id and s.day_of_week = i.day_of_week
    and s.start_time = i.start_time and s.event_type = 'regular' and s.status = 'active'
);

select (select count(*) from public.schedules where notes = '{MARKER}') as imported_lessons,
       (select count(*) from public.schedules where fb_group_url is not null) as lessons_with_fb_link,
       (select count(*) from public.classrooms where notes = '{MARKER}') as new_classes,
       (select count(*) from public.schedules where notes = '{MARKER}' and start_recur > date '{START_RECUR}') as start_after_first_day,
       (select count(*) from public.schedules) as all_schedules;

commit;
""", encoding='utf-8')
    (out / 'rollback.sql').write_text(f"""-- Undo import_schedules.sql on EduHero. Only rows the import made ('{MARKER}').
-- A lesson that already has attendance or a class session is KEPT, and so is a new class that
-- already has pupils or lessons (both listed by the last select) - deleting them would delete real records.
begin;

delete from public.schedules s
where s.notes = '{MARKER}'
  and not exists (select 1 from public.lesson_logs l where l.schedule_id = s.id)
  and not exists (select 1 from public.class_sessions c where c.schedule_id = s.id);

delete from public.classrooms c
where c.notes = '{MARKER}'
  and not exists (select 1 from public.schedules s where s.classroom_id = c.id)
  and not exists (select 1 from public.students st where st.classroom_id = c.id)
  and not exists (select 1 from public.student_classroom_periods p where p.classroom_id = c.id);

select 'lesson kept' as what, id, title from public.schedules where notes = '{MARKER}'
union all
select 'class kept', id, name from public.classrooms where notes = '{MARKER}';

commit;
-- classroom_teachers rows added for existing classes and the 升级班 program level stay (harmless;
-- remove by hand in Class > Teachers / Class Settings).
""", encoding='utf-8')


def write_private(private, matched, zoom_rows):
    emails = {n: (zoom_rows.get(2, {}).get(n + 1) or '').strip() for n in range(1, 11)}
    lines = ["-- PRIVATE: fixed Zoom links (with passcode) + Zoom account e-mails. Do not commit or paste.",
             "-- Needs migration 20261025200000_schedule_links.sql and import_schedules.sql first.", "begin;"]
    for m in matched:
        if not m['ok'] or not m['zoom']:
            continue
        link = re.search(r'https?://[\w.]+\.zoom\.us/\S+', m['zoom'])
        if not link:
            continue
        lines.append(f"update public.schedules set zoom_link = {q(link.group(0))} where classroom_id = (select id from public.classrooms where name = {q(m['classroom'])}) "
                     f"and teacher_id = {m['teacher_id']} and day_of_week = {m['dow']} and start_time = time '{m['start']}' "
                     f"and event_type = 'regular' and status = 'active' and zoom_link is null;")
    done = set()
    for key, account in ZOOM_ACCOUNT.items():
        teacher = TEACHERS.get(key)
        if teacher and teacher not in done and emails.get(account):
            done.add(teacher)
            lines.append(f"update public.teachers set zoom_host_user = {q(emails[account])} where id = {teacher} and zoom_host_user is null;")
    pool = [emails[n] for n in range(1, 11) if n not in MIRAI_ONLY and emails.get(n)]
    lines.append("update public.app_settings set value = jsonb_build_object('hosts', "
                 f"jsonb_build_array({', '.join(q(e) for e in pool)}), 'per_host', {PER_HOST}), "
                 "updated_at = timezone('utc', now()) where key = 'zoom_hosts';")
    lines.append("commit;")
    (private / 'zoom_private.sql').write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main():
    sheet_path, snapshot_path, out_dir, private_dir = sys.argv[1:5]
    sheets = read_xlsx(sheet_path)
    timetable = sheets[next(name for name in sheets if name.startswith('2026总时间表'))]
    snapshot = json.loads(Path(snapshot_path).read_text(encoding='utf-8'))
    snapshot = snapshot['rows'][0]['j'] if isinstance(snapshot, dict) and 'rows' in snapshot else snapshot
    snapshot = json.loads(snapshot) if isinstance(snapshot, str) else snapshot
    classrooms = {c['name']: c for c in snapshot['classrooms']}
    subject_ids = {subject['name']: subject['id'] for subject in snapshot['subjects']}
    matched = [match(lesson, classrooms, subject_ids) for lesson in lessons(timetable)]
    busy = defaultdict(list)
    for m in matched:
        if m['zoom_account']:
            busy[(m['zoom_account'], m['dow'], m['start'])].append(m['label'])
    full = {slot: labels for slot, labels in busy.items() if len(labels) > PER_HOST}
    if full:
        raise SystemExit(f'Zoom account over {PER_HOST} lessons at once: {full}')
    out, private = Path(out_dir), Path(private_dir)
    out.mkdir(parents=True, exist_ok=True)
    private.mkdir(parents=True, exist_ok=True)
    write_import(out, matched)
    write_private(private, matched, sheets.get('ZOOM ACC', {}))
    with open(out / 'preview.csv', 'w', newline='', encoding='utf-8-sig') as handle:
        writer = csv.writer(handle)
        writer.writerow(['day', 'start', 'end', 'sheet_label', 'crm_class', 'crm_class_id', 'teacher_id',
                         'zoom_account', 'fb_link', 'zoom_link', 'zoom_domain', 'status'])
        for m in matched:
            domain = re.search(r'https?://([\w.]+)\.zoom\.us', m['zoom'] or '')
            writer.writerow([m['dow'], m['start'], m['end'], m['label'], m['classroom'] or '', m['classroom_id'] or '',
                             m['teacher_id'] or '', f"A{m['zoom_account']}" if m['zoom_account'] else '',
                             'yes' if m['fb'] else 'no', 'yes' if m['zoom'] else 'no',
                             domain.group(1) if domain else '', 'ok' if m['ok'] else '; '.join(m['reasons'])])
    print(f"{len(matched)} lessons, {sum(m['ok'] for m in matched)} ready to import")


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
