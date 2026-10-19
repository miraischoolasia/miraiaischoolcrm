-- EduHero 2026 weekly timetable -> schedules. EduHero database ONLY.
-- Made by build_import.py from the Sheet: 224 of 224 lessons, 2 new classes.
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

-- Classes the timetable needs that EduHero does not have yet (boss approved 2026-10-19).
insert into public.program_levels (name, sort_order)
values ('升级班', 25)
on conflict (name) do nothing;

insert into public.classrooms (name, age_group, program_level, teacher_id, status, category, subject_id, notes)
select v.name, v.age_group, v.program_level, v.teacher_id, 'active', 'regular', v.subject_id, 'import:eduhero-timetable-2026'
from (values
  ('AM 升级班 Form 3', 'Form 3', '升级班', 41, 20),
  ('SCI (双语) Form 3', 'Form 3', '双语班', 25, 13)
) as v(name, age_group, program_level, teacher_id, subject_id)
where not exists (select 1 from public.classrooms c where c.name = v.name);

create temporary table timetable_import (
  sheet_row int, sheet_col int, classroom_name text, teacher_id bigint, day_of_week smallint,
  start_time time, end_time time, title text, fb_group_url text, classroom_id bigint
) on commit drop;

insert into timetable_import (sheet_row, sheet_col, classroom_name, teacher_id, day_of_week,
                              start_time, end_time, title, fb_group_url)
values
  (2, 2, 'SCI Form 1', 26, 1, time '08:15', time '09:30', 'F1 SCI MS ANGELINE', 'https://web.facebook.com/groups/1448630042859924'),
  (5, 2, 'SCI Form 1', 52, 1, time '08:15', time '09:30', 'F1 SAINS MS JOEY', 'https://web.facebook.com/groups/1383895296427020'),
  (8, 2, 'BMK Form 2', 13, 1, time '08:15', time '09:30', 'F2 BMK MS JESSIE', 'https://www.facebook.com/groups/1473211430612238'),
  (2, 3, 'BMP Form 1', 13, 1, time '09:40', time '10:55', 'F1 BMP MS JESSIE', 'https://web.facebook.com/groups/1852142915736426'),
  (5, 3, 'SCI Form 2', 26, 1, time '09:40', time '10:55', 'F2 SCI MS ANGELINE', 'https://www.facebook.com/groups/1087602659855924'),
  (8, 3, 'SCI Form 2', 52, 1, time '09:40', time '10:55', 'F2 SAINS MS JOEY', 'https://www.facebook.com/groups/2887095158146420'),
  (2, 4, 'BMK Year 5', 24, 1, time '15:45', time '17:00', 'Y5 BMK MS REGINA', 'https://www.facebook.com/groups/805402432424631'),
  (5, 4, 'MM Form 1', 27, 1, time '15:45', time '17:00', 'F1 MM MS MADELINE', 'https://www.facebook.com/groups/1321619115494067'),
  (8, 4, 'MM Form 2', 14, 1, time '15:45', time '17:00', 'F2 MM 双语 MR HENRY', 'https://www.facebook.com/groups/2581726318849710'),
  (11, 4, 'BMK Form 3', 51, 1, time '15:45', time '17:00', 'F3 BMK MS HAPPY', 'https://www.facebook.com/groups/1563707701281466'),
  (14, 4, 'BC Form 4', 9, 1, time '15:45', time '17:00', 'F4 BC MS ANGIE', 'https://www.facebook.com/groups/1339816730922880'),
  (17, 4, 'BIO Form 5', 23, 1, time '15:45', time '17:00', 'F5 BIO MS TINA', 'https://www.facebook.com/groups/1800760817201358'),
  (2, 5, 'BMP Year 3', 24, 1, time '17:15', time '18:30', 'Y3 BMP MS REGINA', 'https://www.facebook.com/groups/2266507590442037'),
  (5, 5, 'BIP Year 5', 42, 1, time '17:15', time '18:30', 'Y5 BIP MS ABBY', 'https://www.facebook.com/groups/771889299047531'),
  (8, 5, 'SEJ Form 1', 13, 1, time '17:15', time '18:30', 'F1 SEJ MS JESSIE', 'https://www.facebook.com/groups/1156243273363195'),
  (11, 5, 'BC Form 1', 35, 1, time '17:15', time '18:30', 'F1 BC MS KIWI', 'https://www.facebook.com/groups/1433722411253694'),
  (14, 5, 'SCI Form 2', 26, 1, time '17:15', time '18:30', 'F2 SCI MS ANGELINE', 'https://www.facebook.com/groups/2662554984136396'),
  (17, 5, 'SCI Form 2', 52, 1, time '17:15', time '18:30', 'F2 SAINS MS JOEY', 'https://www.facebook.com/groups/1456695102206023'),
  (20, 5, 'AM 升级班 Form 3', 41, 1, time '17:15', time '18:30', 'F3 UP F4 AM MASTER TAN', 'https://www.facebook.com/groups/1304742314525912'),
  (23, 5, 'MM Form 4', 14, 1, time '17:15', time '18:30', 'F4 MM 双语 MR HENRY', 'https://www.facebook.com/groups/801728919419314'),
  (26, 5, 'SEJ Form 4', 30, 1, time '17:15', time '18:30', 'F4 SEJ MS AUDREY', 'https://www.facebook.com/groups/1978701176318584'),
  (29, 5, 'BMK Form 5', 51, 1, time '17:15', time '18:30', 'F5 BMK MS HAPPY', 'https://www.facebook.com/groups/24638360049199498'),
  (32, 5, 'PHY Form 5', 23, 1, time '17:15', time '18:30', 'F5 PHY MS TINA', 'https://www.facebook.com/groups/1492817678607326'),
  (2, 6, 'BC Year 4', 9, 1, time '19:00', time '20:15', 'Y4 BC MS ANGIE', 'https://www.facebook.com/groups/648694738058686'),
  (5, 6, 'BMK Year 5', 55, 1, time '19:00', time '20:15', 'Y5 BMK MS JENNY', 'https://www.facebook.com/groups/1185630883387360'),
  (8, 6, 'MM Year 6', 41, 1, time '19:00', time '20:15', 'Y6 UP F1 MM MASTER TAN MON 7PM', 'https://www.facebook.com/groups/1154154850009621'),
  (11, 6, 'BIK Year 6', 42, 1, time '19:00', time '20:15', 'Y6 BIK MS ABBY', 'https://www.facebook.com/groups/1948821595896138'),
  (14, 6, 'SEJ Form 3', 38, 1, time '19:00', time '20:15', 'F3 SEJ MR JACK', 'https://www.facebook.com/groups/1538615347133441'),
  (17, 6, 'SCI Form 4', 26, 1, time '19:00', time '20:15', 'F4 SCI MS ANGELINE', 'https://www.facebook.com/groups/1470846960673164'),
  (20, 6, 'SCI Form 4', 52, 1, time '19:00', time '20:15', 'F4 SAINS MS JOEY', 'https://www.facebook.com/groups/1321167149352678'),
  (23, 6, 'BIO Form 4', 23, 1, time '19:00', time '20:15', 'F4 BIO MS TINA', 'https://www.facebook.com/groups/4093583450853944'),
  (26, 6, 'BMP Form 5', 29, 1, time '19:00', time '20:15', 'F5 BMP MS SOPHIA', 'https://www.facebook.com/groups/2979161678934007'),
  (29, 6, 'PHY Form 5', 15, 1, time '19:00', time '20:15', 'F5 PHYSICS MR KC', 'https://www.facebook.com/groups/2272039813235776'),
  (2, 7, 'MM Year 3', 28, 1, time '20:30', time '21:45', 'Y3 MM MR DANNY', 'https://www.facebook.com/groups/1526836232083207'),
  (5, 7, 'MM Year 4', 12, 1, time '20:30', time '21:45', 'Y4 MM MS QING', 'https://www.facebook.com/groups/1484764465905778'),
  (8, 7, 'BIP Year 5', 42, 1, time '20:30', time '21:45', 'Y5 BIP MS ABBY', 'https://www.facebook.com/groups/1771013470277910'),
  (11, 7, 'BMP Year 6', 55, 1, time '20:30', time '21:45', 'Y6 BMP MS JENNY', 'https://www.facebook.com/groups/1360474899038653'),
  (14, 7, 'GEO Form 1', 27, 1, time '20:30', time '21:45', 'F1 GEO MS MAD', 'https://web.facebook.com/groups/2207714659735134'),
  (17, 7, 'SEJ Form 2', 38, 1, time '20:30', time '21:45', 'F2 SEJ MR JACK', 'https://www.facebook.com/groups/2259028171206769'),
  (20, 7, 'BC Form 3', 9, 1, time '20:30', time '21:45', 'F3 BC MS ANGIE', 'https://www.facebook.com/groups/775046888471270'),
  (23, 7, 'BMP Form 4', 29, 1, time '20:30', time '21:45', 'F4 BMP MS SOPHIA', 'https://www.facebook.com/groups/1178317584213405'),
  (26, 7, 'PHY Form 4', 15, 1, time '20:30', time '21:45', 'F4 PHYSICS MR KC', 'https://www.facebook.com/groups/1840009546864710'),
  (29, 7, 'BIO Form 5', 26, 1, time '20:30', time '21:45', 'F5 BIO MS ANGELINE', 'https://www.facebook.com/groups/4268033253484562'),
  (32, 7, 'MM Form 5', 14, 1, time '20:30', time '21:45', 'F5 MM 双语 MR HENRY', 'https://www.facebook.com/groups/805667401854977'),
  (35, 7, 'BC Form 5', 35, 1, time '20:30', time '21:45', 'F5 BC MS KIWI', 'https://www.facebook.com/groups/853928466989901'),
  (41, 2, 'SEJ Form 1', 30, 2, time '08:15', time '09:30', 'F1 SEJ MS AUDREY', 'https://www.facebook.com/groups/800872585682759'),
  (44, 2, 'GEO Form 2', 27, 2, time '08:15', time '09:30', 'F2 GEO MS MAD', 'https://www.facebook.com/groups/1886604745262763'),
  (41, 3, 'GEO Form 1', 27, 2, time '09:40', time '10:55', 'F1 GEO MS MAD', 'https://web.facebook.com/groups/781752981155764'),
  (44, 3, 'SEJ Form 2', 30, 2, time '09:40', time '10:55', 'F2 SEJ MS AUDREY', 'https://www.facebook.com/groups/24371753579191292'),
  (41, 4, 'BC Year 3', 35, 2, time '15:45', time '17:00', 'Y3 BC MS KIWI', 'https://www.facebook.com/groups/1206107224880983'),
  (44, 4, 'SEJ Year 5', 13, 2, time '15:45', time '17:00', 'Y5 SEJ MS JESSIE', 'https://www.facebook.com/groups/2275086702963532'),
  (47, 4, 'BMK Year 6', 24, 2, time '15:45', time '17:00', 'Y6 BMK MS REGINA', 'https://www.facebook.com/groups/598084699961306'),
  (50, 4, 'BIK Form 1', 42, 2, time '15:45', time '17:00', 'F1 BIK MS ABBY', 'https://web.facebook.com/groups/1164098855600685'),
  (53, 4, 'BMK Form 2', 51, 2, time '15:45', time '17:00', 'F2 BMK MS HAPPY', 'https://www.facebook.com/groups/1324645882407325'),
  (56, 4, 'BC Form 3', 9, 2, time '15:45', time '17:00', 'F3 BC MS ANGIE', 'https://www.facebook.com/groups/1380226693695547'),
  (59, 4, 'SCI (双语) Form 4', 52, 2, time '15:45', time '17:00', 'F4 SAINS (双语) MS JOEY', 'https://www.facebook.com/groups/1335350974645057'),
  (62, 4, 'CHE Form 5', 23, 2, time '15:45', time '17:00', 'F5 CHEMI MS TINA', 'https://www.facebook.com/groups/1872610316973482'),
  (41, 5, 'SEJ Year 4', 13, 2, time '17:15', time '18:30', 'Y4 SEJ MS JESSIE', 'https://www.facebook.com/groups/1983649619060622'),
  (44, 5, 'BMP Year 5', 24, 2, time '17:15', time '18:30', 'Y5 BMP MS REGINA', 'https://www.facebook.com/groups/1329796985210203'),
  (47, 5, 'BIK Year 6', 42, 2, time '17:15', time '18:30', 'Y6 BIK MS ABBY', 'https://www.facebook.com/groups/2268773653591196'),
  (50, 5, 'BMK Form 1', 51, 2, time '17:15', time '18:30', 'F1 BMK MS HAPPY', 'https://www.facebook.com/groups/1904927156734193'),
  (53, 5, 'BIK Form 2', 10, 2, time '17:15', time '18:30', 'F2 BIK MS RACHEL', 'https://www.facebook.com/groups/1093468209524529'),
  (56, 5, 'BIO Form 4', 15, 2, time '17:15', time '18:30', 'F4 BIOLOGY MR KC', 'https://www.facebook.com/groups/799340189561859'),
  (59, 5, 'AM Form 4', 41, 2, time '17:15', time '18:30', 'F4 AM MASTER TAN', 'https://www.facebook.com/groups/817709817383019'),
  (62, 5, 'BMK Form 5', 29, 2, time '17:15', time '18:30', 'F5 BMK MS SOPHIA', 'https://www.facebook.com/groups/1386159773511950'),
  (65, 5, 'AM Form 5', 14, 2, time '17:15', time '18:30', 'F5 AM MR HENRY', 'https://www.facebook.com/groups/1138193174475399'),
  (41, 6, 'BIK Year 3', 42, 2, time '19:00', time '20:15', 'Y3 BIK MS ABBY', 'https://www.facebook.com/groups/817002404436853'),
  (44, 6, 'BMK Year 4', 55, 2, time '19:00', time '20:15', 'Y4 BMK MS JENNY', 'https://www.facebook.com/groups/1161559389354444'),
  (47, 6, 'MM Year 5', 28, 2, time '19:00', time '20:15', 'Y5 MM MR DANNY', 'https://www.facebook.com/groups/1369032047977084'),
  (50, 6, 'SCI Form 1', 26, 2, time '19:00', time '20:15', 'F1 SCI MS ANGELINE', 'https://www.facebook.com/groups/782186911387901'),
  (53, 6, 'SCI Form 1', 52, 2, time '19:00', time '20:15', 'F1 SAINS MS JOEY', 'https://www.facebook.com/groups/1173764141474144'),
  (56, 6, 'BC Form 2', 35, 2, time '19:00', time '20:15', 'F2 BC MS KIWI', 'https://www.facebook.com/groups/1874866123429611'),
  (59, 6, 'BMP Form 3', 29, 2, time '19:00', time '20:15', 'F3 BMP MS SOPHIA', 'https://www.facebook.com/groups/800863076019573'),
  (62, 6, 'BIP Form 3', 21, 2, time '19:00', time '20:15', 'F3 BIP MS MELISSA', 'https://www.facebook.com/groups/1284835609625076'),
  (65, 6, 'BC Form 4', 9, 2, time '19:00', time '20:15', 'F4 BC MS ANGIE', 'https://www.facebook.com/groups/1109255567944449'),
  (68, 6, 'PHY Form 4', 23, 2, time '19:00', time '20:15', 'F4 PHY MS TINA', 'https://www.facebook.com/groups/3246104845538186'),
  (71, 6, 'BIO Form 5', 15, 2, time '19:00', time '20:15', 'F5 BIOLOGY MR KC', 'https://www.facebook.com/groups/746180741789069'),
  (74, 6, 'SEJ Form 5', 38, 2, time '19:00', time '20:15', 'F5 SEJ MR JACK', 'https://www.facebook.com/groups/1381834926892591'),
  (41, 7, 'SCI Year 4', 52, 2, time '20:30', time '21:45', 'Y4 SC MS JOEY', 'https://www.facebook.com/groups/2089128901615698'),
  (44, 7, 'BC Year 5', 9, 2, time '20:30', time '21:45', 'Y5 BC MS ANGIE', 'https://www.facebook.com/groups/1302734474237026'),
  (47, 7, 'BIP Year 6', 42, 2, time '20:30', time '21:45', 'Y6 BIP MS ABBY', 'https://www.facebook.com/groups/1782171889074091'),
  (50, 7, 'SEJ Form 1', 38, 2, time '20:30', time '21:45', 'F1 SEJ MR JACK', 'https://web.facebook.com/groups/25212995108324555f'),
  (53, 7, 'BMP Form 2', 29, 2, time '20:30', time '21:45', 'F2 BMP MS SOPHIA', 'https://www.facebook.com/groups/838633038595369'),
  (56, 7, 'MM Form 3', 14, 2, time '20:30', time '21:45', 'F3 MM MR HENRY', 'https://www.facebook.com/groups/676882238341918'),
  (59, 7, 'BIK Form 3', 10, 2, time '20:30', time '21:45', 'F3 BIK MS RACHEL', 'https://www.facebook.com/groups/1334065794907997'),
  (62, 7, 'CHE Form 4', 26, 2, time '20:30', time '21:45', 'F4 CHEMI MS ANGELINE', 'https://www.facebook.com/groups/1472510583983673'),
  (65, 7, 'MM Form 4', 41, 2, time '20:30', time '21:45', 'F4 MM MASTER TAN', 'https://www.facebook.com/groups/1301626325312049'),
  (68, 7, 'AM Form 5', 51, 2, time '20:30', time '21:45', 'F5 AM MS HAPPY', 'https://www.facebook.com/groups/1368025828076903'),
  (71, 7, 'BIP Form 5', 21, 2, time '20:30', time '21:45', 'F5 BIP MS MELISSA', 'https://www.facebook.com/groups/1166016872046639'),
  (74, 7, 'PHY Form 5', 23, 2, time '20:30', time '21:45', 'F5 PHY MS TINA', 'https://www.facebook.com/groups/4138029133102317'),
  (85, 2, 'BIP Form 1', 10, 3, time '08:15', time '09:30', 'F1 BIP MS RACHEL', 'https://web.facebook.com/groups/770361949321158'),
  (85, 3, 'BIP Form 2', 10, 3, time '09:40', time '10:55', 'F2 BIP MS RACHEL', 'https://www.facebook.com/groups/2880206112179985'),
  (85, 5, 'BC Year 5', 35, 3, time '17:15', time '18:30', 'Y5 BC MS KIWI', 'https://www.facebook.com/groups/1576801353731036'),
  (88, 5, 'BIP Year 6', 42, 3, time '17:15', time '18:30', 'Y6 BIP MS ABBY', 'https://www.facebook.com/groups/1784298135535044'),
  (91, 5, 'BC Form 1', 33, 3, time '17:15', time '18:30', 'F1 BC MR HANSON', 'https://www.facebook.com/groups/2141900443025436'),
  (94, 5, 'BIK Form 4', 21, 3, time '17:15', time '18:30', 'F4 BIK MS MELISSA', 'https://www.facebook.com/groups/2054442972048707'),
  (97, 5, 'BIO Form 4', 26, 3, time '17:15', time '18:30', 'F4 BIO MS ANGELINE', 'http://www.facebook.com/groups/1170529975251012'),
  (100, 5, 'AM Form 5', 14, 3, time '17:15', time '18:30', 'F5 AM MR HENRY', 'https://www.facebook.com/groups/842183501472987'),
  (85, 6, 'MM Year 4', 12, 3, time '19:00', time '20:15', 'Y4 MM MS QING', 'https://www.facebook.com/groups/1984378322319447'),
  (88, 6, 'SEJ Year 4', 13, 3, time '19:00', time '20:15', 'Y4 SEJ MS JESSIE', 'https://www.facebook.com/groups/794425060216077'),
  (91, 6, 'SCI Year 5', 52, 3, time '19:00', time '20:15', 'Y5 SCI MS JOEY', 'https://www.facebook.com/groups/791656637172497'),
  (94, 6, 'BIK Year 5', 42, 3, time '19:00', time '20:15', 'Y5 BIK MS ABBY', 'https://www.facebook.com/groups/1788325838489663'),
  (97, 6, 'BMK Year 6', 55, 3, time '19:00', time '20:15', 'Y6 BMK MS JENNY', 'https://www.facebook.com/groups/1176367567762851'),
  (100, 6, 'MM Form 1', 14, 3, time '19:00', time '20:15', 'F1 MM 双语 MR HENRY', 'https://www.facebook.com/groups/1253407816470535'),
  (103, 6, 'GEO Form 2', 27, 3, time '19:00', time '20:15', 'F2 GEO MS MAD', 'https://www.facebook.com/groups/1313772263544759'),
  (106, 6, 'SEJ Form 3', 30, 3, time '19:00', time '20:15', 'F3 SEJ MS AUDREY', 'https://www.facebook.com/groups/1077796484280721'),
  (109, 6, 'BIK Form 3', 21, 3, time '19:00', time '20:15', 'F3 BIK MS MELISSA', 'https://www.facebook.com/groups/1795880994652611'),
  (112, 6, 'SEJ Form 4', 38, 3, time '19:00', time '20:15', 'F4 SEJ MR JACK', 'https://www.facebook.com/groups/1148216463939576'),
  (115, 6, 'ACC Form 5', 17, 3, time '19:00', time '20:15', 'F5 ACC MS EUNICE', 'https://www.facebook.com/groups/836165832184791'),
  (118, 6, 'BMP Form 5', 51, 3, time '19:00', time '20:15', 'F5 BMP MS HAPPY', 'https://www.facebook.com/groups/1179078680699862'),
  (85, 7, 'BIP Year 4', 42, 3, time '20:30', time '21:45', 'Y4 BIP MS ABBY', 'https://www.facebook.com/groups/1821709171762605'),
  (88, 7, 'BMP Year 5', 55, 3, time '20:30', time '21:45', 'Y5 BMP MS JENNY', 'https://www.facebook.com/groups/1715288952518169'),
  (91, 7, 'BC Year 6', 9, 3, time '20:30', time '21:45', 'Y6 BC MS ANGIE', 'https://www.facebook.com/groups/1987774502005568'),
  (94, 7, 'BMP Form 1', 13, 3, time '20:30', time '21:45', 'F1 BMP MS JESSIE', 'https://web.facebook.com/groups/1303761117489975'),
  (97, 7, 'SCI (双语) Form 2', 52, 3, time '20:30', time '21:45', 'F2 SCI MS JOEY 双语', 'https://www.facebook.com/groups/643990918785002'),
  (100, 7, 'AM 升级班 Form 3', 14, 3, time '20:30', time '21:45', 'F3 UP F4 AM MR HENRY', 'https://www.facebook.com/groups/2332571437178439'),
  (103, 7, 'BIP Form 3', 10, 3, time '20:30', time '21:45', 'F3 BIP MS RACHEL', 'https://www.facebook.com/groups/2787586208246971'),
  (106, 7, 'CHE Form 4', 23, 3, time '20:30', time '21:45', 'F4 CHEMI MS TINA', 'https://www.facebook.com/groups/1149844469807914'),
  (109, 7, 'BMP Form 4', 51, 3, time '20:30', time '21:45', 'F4 BMP MS HAPPY', 'https://www.facebook.com/groups/24712876385065123'),
  (112, 7, 'PER Form 4', 30, 3, time '20:30', time '21:45', 'F4 PN MS AUDREY', 'https://www.facebook.com/groups/1166008732248839'),
  (115, 7, 'MM Form 5', 41, 3, time '20:30', time '21:45', 'F5 MM MASTER TAN 双语', 'https://www.facebook.com/groups/1357423892505604'),
  (118, 7, 'BIO Form 5', 15, 3, time '20:30', time '21:45', 'F5 BIOLOGY MR KC', 'https://www.facebook.com/groups/820448353871046'),
  (130, 2, 'BMP Form 2', 13, 4, time '08:15', time '09:30', 'F2 BMP MS JESSIE', 'https://www.facebook.com/groups/24937345715878442'),
  (130, 3, 'BMK Form 1', 13, 4, time '09:40', time '10:55', 'F1 BMK MS JESSIE', 'https://web.facebook.com/groups/1474050900501455'),
  (130, 4, 'BIP Year 3', 42, 4, time '15:45', time '17:00', 'Y3 BIP MS ABBY', 'https://www.facebook.com/groups/2762823167249652'),
  (133, 4, 'SEJ Year 6', 13, 4, time '15:45', time '17:00', 'Y6 SEJ MS JESSIE', 'https://www.facebook.com/groups/773998462093648'),
  (136, 4, 'GEO Form 1', 27, 4, time '15:45', time '17:00', 'F1 GEO MS MAD', 'https://web.facebook.com/groups/1716615076393061'),
  (139, 4, 'BIP Form 2', 10, 4, time '15:45', time '17:00', 'F2 BIP MS RACHEL', 'https://www.facebook.com/groups/782647957988476'),
  (142, 4, 'SCI Form 3', 26, 4, time '15:45', time '17:00', 'F3 SCI MS ANGELINE', 'https://www.facebook.com/groups/2295986074157139'),
  (145, 4, 'SCI Form 3', 52, 4, time '15:45', time '17:00', 'F3 SAINS MS JOEY', 'https://www.facebook.com/groups/1677302410323909'),
  (148, 4, 'BIO Form 4', 23, 4, time '15:45', time '17:00', 'F4 BIO MS TINA', 'https://www.facebook.com/groups/1870445700551241'),
  (151, 4, 'EKO Form 5', 30, 4, time '15:45', time '17:00', 'F5 EKO MS AUDREY', 'https://www.facebook.com/groups/1103482925107236'),
  (154, 4, 'PHY Form 5', 15, 4, time '15:45', time '17:00', 'F5 PHYSICS MR KC', 'https://www.facebook.com/groups/9363518417106001'),
  (130, 5, 'BMP Year 6', 24, 4, time '17:15', time '18:30', 'Y6 BMP MS REGINA', 'https://www.facebook.com/groups/643741178616373'),
  (133, 5, 'BIP Form 1', 42, 4, time '17:15', time '18:30', 'F1 BIP MS ABBY', 'https://www.facebook.com/groups/1717334928932066'),
  (136, 5, 'SEJ Form 2', 30, 4, time '17:15', time '18:30', 'F2 SEJ MS AUDREY', 'https://www.facebook.com/groups/984027817217247'),
  (139, 5, 'MM Form 3', 41, 4, time '17:15', time '18:30', 'F3 MM MASTER TAN', 'https://www.facebook.com/groups/1718738095485813'),
  (142, 5, 'BC Form 3', 35, 4, time '17:15', time '18:30', 'F3 BC MS KIWI', 'https://www.facebook.com/groups/1341397834310675'),
  (145, 5, 'CHE Form 4', 15, 4, time '17:15', time '18:30', 'F4 CHEMI MR KC', 'https://www.facebook.com/groups/1476949026943762'),
  (148, 5, 'MM Form 5', 14, 4, time '17:15', time '18:30', 'F5 MM MR HENRY', 'https://www.facebook.com/groups/795238873084811'),
  (151, 5, 'CHE Form 5', 23, 4, time '17:15', time '18:30', 'F5 CHEMI MS TINA', 'https://www.facebook.com/groups/4230739020531303'),
  (154, 5, 'SCI (双语) Form 5', 52, 4, time '17:15', time '18:30', 'F5 SAINS 双语 MS JOEY', 'https://www.facebook.com/groups/1141358507364009'),
  (130, 6, 'BMP Year 4', 24, 4, time '19:00', time '20:15', 'Y4 BMP MS REGINA', 'https://www.facebook.com/groups/1169101278397202'),
  (133, 6, 'BC Form 2', 33, 4, time '19:00', time '20:15', 'F2 BC MR HANSON', 'https://www.facebook.com/groups/27025040280529583'),
  (136, 6, 'MM Form 3', 27, 4, time '19:00', time '20:15', 'F3 MM MS MADELINE', 'https://www.facebook.com/groups/3775257799442587'),
  (139, 6, 'BMP Form 3', 51, 4, time '19:00', time '20:15', 'F3 BMP MS HAPPY', 'https://www.facebook.com/groups/1527849485329083'),
  (142, 6, 'AM Form 4', 14, 4, time '19:00', time '20:15', 'F4 AM MR HENRY', 'https://www.facebook.com/groups/2395615150579562'),
  (145, 6, 'BIP Form 4', 21, 4, time '19:00', time '20:15', 'F4 BIP MS MELISSA', 'https://www.facebook.com/groups/1310599669731024'),
  (148, 6, 'ACC Form 4', 17, 4, time '19:00', time '20:15', 'F4 ACC MS EUNICE', 'https://www.facebook.com/groups/458176159852853'),
  (151, 6, 'SCI (双语) Form 4', 25, 4, time '19:00', time '20:15', 'F4 SC 双语 MR KEE', 'https://www.facebook.com/groups/712249113563997'),
  (154, 6, 'CHE Form 5', 26, 4, time '19:00', time '20:15', 'F5 CHEMI MS ANGELINE', 'https://www.facebook.com/groups/845576896726911'),
  (157, 6, 'MM Form 5', 41, 4, time '19:00', time '20:15', 'F5 MM MASTER TAN 双语', 'https://www.facebook.com/groups/1115094449160768'),
  (160, 6, 'BC Form 5', 9, 4, time '19:00', time '20:15', 'F5 BC MS ANGIE', 'https://www.facebook.com/groups/1614844132310903'),
  (130, 7, 'BC Year 4', 35, 4, time '20:30', time '21:45', 'Y4 BC MS KIWI', 'https://www.facebook.com/groups/799732546209417'),
  (133, 7, 'MM Year 6', 27, 4, time '20:30', time '21:45', 'Y6 UP F1 MM MS MADELINE', 'https://www.facebook.com/groups/793782926705991'),
  (136, 7, 'SCI Form 1', 52, 4, time '20:30', time '21:45', 'F1 SCI MS JOEY', 'https://web.facebook.com/groups/1339631724221074'),
  (139, 7, 'BC Form 1', 9, 4, time '20:30', time '21:45', 'F1 BC MS ANGIE', 'https://web.facebook.com/groups/1351930943132813'),
  (142, 7, 'BIP Form 2', 42, 4, time '20:30', time '21:45', 'F2 BIP MS ABBY', 'https://www.facebook.com/groups/2088031692001819'),
  (145, 7, 'SCI (双语) Form 3', 25, 4, time '20:30', time '21:45', 'F3 SC 双语 MR KEE', 'https://www.facebook.com/groups/538964071586127'),
  (148, 7, 'BC Form 3', 33, 4, time '20:30', time '21:45', 'F3 BC MR HANSON', 'https://www.facebook.com/groups/927949779704252'),
  (151, 7, 'MM Form 4', 14, 4, time '20:30', time '21:45', 'F4 MM 双语 MR HENRY', 'https://www.facebook.com/groups/25297850443134718'),
  (154, 7, 'BIO Form 4', 15, 4, time '20:30', time '21:45', 'F4 BIOLOGY MS KC', 'https://www.facebook.com/groups/1349510913241762'),
  (157, 7, 'PHY Form 4', 23, 4, time '20:30', time '21:45', 'F4 PHY MS TINA', 'https://www.facebook.com/groups/2743439972654212'),
  (160, 7, 'BIK Form 5', 21, 4, time '20:30', time '21:45', 'F5 BIK MS MELISSA', 'https://www.facebook.com/groups/1460881638535861'),
  (163, 7, 'SEJ Form 5', 30, 4, time '20:30', time '21:45', 'F5 SEJ MS AUDREY', 'https://www.facebook.com/groups/2314982122288428'),
  (176, 2, 'MM Form 1', 14, 5, time '08:15', time '09:30', 'F1 MM 双语 MR HENRY', 'https://web.facebook.com/groups/1981758985924579'),
  (179, 2, 'BIK Form 2', 10, 5, time '08:15', time '09:30', 'F2 BIK MS RACHEL', 'https://www.facebook.com/groups/1788108671828446'),
  (176, 3, 'BIK Form 1', 10, 5, time '09:40', time '10:55', 'F1 BIK MS RACHEL', 'https://web.facebook.com/groups/1826249408267301'),
  (179, 3, 'MM Form 2', 14, 5, time '09:40', time '10:55', 'F2 MM 双语 MR HENRY', 'https://www.facebook.com/groups/31874173688894973'),
  (176, 4, 'BIK Year 5', 42, 5, time '15:45', time '17:00', 'Y5 BIK MS ABBY', 'https://www.facebook.com/groups/1358206342327928'),
  (179, 4, 'BMP Form 1', 51, 5, time '15:45', time '17:00', 'F1 BMP MS HAPPY', 'https://web.facebook.com/groups/1484475576169168'),
  (182, 4, 'BIK Form 4', 10, 5, time '15:45', time '17:00', 'F4 BIK MS RACHEL', 'https://www.facebook.com/groups/1334610011726804'),
  (185, 4, 'PHY Form 4', 15, 5, time '15:45', time '17:00', 'F4 PHYSICS MR KC', 'https://www.facebook.com/groups/1320810633023215'),
  (188, 4, 'PER Form 5', 30, 5, time '15:45', time '17:00', 'F5 PN MS AUDREY', 'https://www.facebook.com/groups/1504052074123183'),
  (191, 4, 'BC Form 5', 9, 5, time '15:45', time '17:00', 'F5 BC MS ANGIE', 'https://www.facebook.com/groups/3906755726135932'),
  (176, 5, 'BMK Year 3', 24, 5, time '17:15', time '18:30', 'Y3 BMK MS REGINA', 'https://www.facebook.com/groups/1110000174628907'),
  (179, 5, 'SEJ Year 5', 13, 5, time '17:15', time '18:30', 'Y5 SEJ MS JESSIE', 'https://www.facebook.com/groups/2351409921954332'),
  (182, 5, 'BC Year 6', 35, 5, time '17:15', time '18:30', 'Y6 BC MS KIWI', 'https://www.facebook.com/groups/1461946078369464'),
  (185, 5, 'BMP Form 2', 51, 5, time '17:15', time '18:30', 'F2 BMP MS HAPPY', 'https://www.facebook.com/groups/1324718019439272'),
  (188, 5, 'SCI Form 3', 26, 5, time '17:15', time '18:30', 'F3 SCI MS ANGELINE', 'https://www.facebook.com/groups/1122586066668074'),
  (191, 5, 'SCI Form 3', 52, 5, time '17:15', time '18:30', 'F3 SAINS MS JOEY', 'https://www.facebook.com/groups/1358826665810131'),
  (194, 5, 'BIP Form 4', 10, 5, time '17:15', time '18:30', 'F4 BIP MS RACHEL', 'https://www.facebook.com/groups/800504429383763'),
  (197, 5, 'CHE Form 4', 23, 5, time '17:15', time '18:30', 'F4 CHEMI MS TINA', 'https://www.facebook.com/groups/797468249733507'),
  (200, 5, 'SCI (双语) Form 5', 25, 5, time '17:15', time '18:30', 'F5 SCI MR KEE 双语', 'https://www.facebook.com/groups/9029354647188831'),
  (203, 5, 'AM Form 5', 41, 5, time '17:15', time '18:30', 'F5 AM MASTER TAN 双语', 'https://www.facebook.com/groups/1496569611386955'),
  (176, 6, 'MM Year 3', 12, 5, time '19:00', time '20:15', 'Y3 MM MS QING', 'https://www.facebook.com/groups/784064627752853'),
  (179, 6, 'BIK Year 4', 42, 5, time '19:00', time '20:15', 'Y4 BIK MS ABBY', 'https://www.facebook.com/groups/2523118274753707'),
  (182, 6, 'SEJ Year 6', 13, 5, time '19:00', time '20:15', 'Y6 SEJ MS JESSIE', 'https://www.facebook.com/groups/825946886656891'),
  (185, 6, 'SEJ Year 6', 38, 5, time '19:00', time '20:15', 'Y6 UP F1 SEJ MR JACK', 'https://www.facebook.com/groups/1341519714578176'),
  (188, 6, 'MM Form 2', 27, 5, time '19:00', time '20:15', 'F2 MM MS MADELINE', 'https://www.facebook.com/groups/677278028748666'),
  (191, 6, 'MM Form 3', 14, 5, time '19:00', time '20:15', 'F3 MM MR HENRY', 'https://www.facebook.com/groups/1342575210931382'),
  (194, 6, 'MM Form 4', 41, 5, time '19:00', time '20:15', 'F4 MM MASTER TAN', 'https://www.facebook.com/groups/1715925805738439'),
  (197, 6, 'EKO Form 4', 30, 5, time '19:00', time '20:15', 'F4 EKO MS AUDREY', 'https://www.facebook.com/groups/1299231901415883'),
  (200, 6, 'ACC Form 4', 25, 5, time '19:00', time '20:15', 'F4 ACC MR KEE', 'https://www.facebook.com/groups/1869704423615671'),
  (203, 6, 'SCI Form 5', 26, 5, time '19:00', time '20:15', 'F5 SCI MS ANGELINE', 'https://www.facebook.com/groups/697225186146442'),
  (206, 6, 'SCI Form 5', 52, 5, time '19:00', time '20:15', 'F5 SAINS MS JOEY', 'https://www.facebook.com/groups/790156030313586'),
  (209, 6, 'CHE Form 5', 15, 5, time '19:00', time '20:15', 'F5 CHEMI MR KC', 'https://www.facebook.com/groups/1005249928404130'),
  (176, 7, 'MM Year 5', 50, 5, time '20:30', time '21:45', 'Y5 MM MS LIJIA', 'https://www.facebook.com/groups/25128201323480349'),
  (179, 7, 'SCI Year 6', 52, 5, time '20:30', time '21:45', 'Y6 SCI MS JOEY', 'https://www.facebook.com/groups/24948028261497756'),
  (182, 7, 'BIP Form 1', 42, 5, time '20:30', time '21:45', 'F1 BIP MS ABBY', 'https://web.facebook.com/groups/1467933517822649'),
  (185, 7, 'GEO Form 2', 27, 5, time '20:30', time '21:45', 'F2 GEO MS MAD', 'https://www.facebook.com/groups/4140215249554349'),
  (188, 7, 'BC Form 2', 9, 5, time '20:30', time '21:45', 'F2 BC MS ANGIE', 'https://www.facebook.com/groups/793352193303424'),
  (191, 7, 'BMK Form 4', 51, 5, time '20:30', time '21:45', 'F4 BMK MS HAPPY', 'https://www.facebook.com/groups/808398878342210'),
  (194, 7, 'AM Form 4', 14, 5, time '20:30', time '21:45', 'F4 AM MR HENRY', 'https://www.facebook.com/groups/1859808517958697'),
  (197, 7, 'BC Form 4', 35, 5, time '20:30', time '21:45', 'F4 BC MS KIWI', 'https://www.facebook.com/groups/2220683358417047'),
  (200, 7, 'BIO Form 4', 48, 5, time '20:30', time '21:45', 'F4 BIO MR IVAN', 'https://www.facebook.com/groups/3343090385865213'),
  (203, 7, 'BIP Form 5', 21, 5, time '20:30', time '21:45', 'F5 BIP MS MELISSA', 'https://www.facebook.com/groups/1932312607341731'),
  (206, 7, 'BIO Form 5', 23, 5, time '20:30', time '21:45', 'F5 BIO MS TINA', 'https://www.facebook.com/groups/1833082767308119'),
  (209, 7, 'ACC Form 5', 25, 5, time '20:30', time '21:45', 'F5 AKAUN MR KEE', 'https://www.facebook.com/groups/792807773465609'),
  (216, 2, 'RBT Form 2', 27, 6, time '11:00', time '12:15', 'F2 RBT MS MADELINE', 'https://www.facebook.com/groups/1796970204329276'),
  (216, 3, 'BMK Form 1', 29, 6, time '11:30', time '12:45', 'F1 BMK MS SOPHIA', 'https://web.facebook.com/groups/1316373380156777'),
  (222, 3, 'BIK Form 4', 21, 6, time '12:00', time '13:15', 'F4 BIK MS MELISSA', 'https://www.facebook.com/groups/1301705801205468'),
  (226, 3, 'MM Year 6', 14, 6, time '12:00', time '13:15', '2026 Y6 up F1 MM MR HENRY', 'https://www.facebook.com/groups/1743567776850813'),
  (232, 3, 'RBT Form 1', 27, 6, time '13:00', time '14:15', 'F1 RBT MS MADELINE', 'https://web.facebook.com/groups/692191797231209'),
  (216, 4, 'MM Form 2', 41, 6, time '13:30', time '14:45', 'F2 MM 双语MASTER TAN', 'https://www.facebook.com/groups/4233523553528174'),
  (219, 4, 'BMK Form 3', 29, 6, time '13:30', time '14:45', 'F3 BMK MS SOPHIA', 'https://www.facebook.com/groups/1316466220140991'),
  (222, 4, 'BIP Form 4', 21, 6, time '13:30', time '14:45', 'F4 BIP MS MELISSA', 'https://www.facebook.com/groups/1889310958679378'),
  (216, 5, 'BMK Form 2', 29, 6, time '15:00', time '16:15', 'F2 BMK MS SOPHIA', 'https://www.facebook.com/groups/833456305722251'),
  (219, 5, 'MM Form 1', 41, 6, time '15:00', time '16:15', 'F1 MM 双语MASTER TAN', 'https://web.facebook.com/groups/1543511109977032'),
  (222, 5, 'BIK Form 5', 21, 6, time '15:00', time '16:15', 'F5 BIK MS MELISSA', 'https://www.facebook.com/groups/1496634161461840'),
  (226, 5, 'RBT Form 3', 27, 6, time '15:00', time '16:15', 'F3 RBT MS MADELINE', 'http://www.facebook.com/groups/1512936153059244'),
  (216, 6, 'BMK Form 4', 29, 6, time '16:30', time '17:45', 'F4 BMK MS SOPHIA', 'https://www.facebook.com/groups/1145911666966999'),
  (216, 7, 'BIK Form 2', 10, 6, time '19:00', time '20:15', 'F2 BIK MS RACHEL', 'https://www.facebook.com/groups/2062450794568923'),
  (216, 8, 'BIK Form 1', 10, 6, time '20:30', time '21:45', 'F1 BIK MS RACHEL', 'https://web.facebook.com/groups/3890314267880706');

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

-- A lesson counts from the moment this runs (Malaysia time), never earlier than 2026-10-19: one that
-- already started today begins tomorrow, so its first class is next week and today's class it has
-- already taught outside the CRM is never owed attendance.
insert into public.schedules (teacher_id, classroom_id, title, event_type, recurrence_type, day_of_week,
                              start_time, end_time, start_recur, end_recur, status, notes, fb_group_url)
select i.teacher_id, i.classroom_id, i.title, 'regular', 'weekly', i.day_of_week,
       i.start_time, i.end_time,
       case
         when clock.kl::date >= date '2026-10-19'
          and i.day_of_week = extract(dow from clock.kl)::int
          and i.start_time <= clock.kl::time
           then clock.kl::date + 1
         else greatest(date '2026-10-19', clock.kl::date)
       end,
       date '2026-12-31', 'active', 'import:eduhero-timetable-2026', i.fb_group_url
from timetable_import i
cross join (select timezone('Asia/Kuala_Lumpur', now()) as kl) as clock
where not exists (
  select 1 from public.schedules s
  where s.classroom_id = i.classroom_id and s.teacher_id = i.teacher_id and s.day_of_week = i.day_of_week
    and s.start_time = i.start_time and s.event_type = 'regular' and s.status = 'active'
);

select (select count(*) from public.schedules where notes = 'import:eduhero-timetable-2026') as imported_lessons,
       (select count(*) from public.schedules where fb_group_url is not null) as lessons_with_fb_link,
       (select count(*) from public.classrooms where notes = 'import:eduhero-timetable-2026') as new_classes,
       (select count(*) from public.schedules where notes = 'import:eduhero-timetable-2026' and start_recur > date '2026-10-19') as start_after_first_day,
       (select count(*) from public.schedules) as all_schedules;

commit;
