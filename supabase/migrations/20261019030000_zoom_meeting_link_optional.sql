-- A Zoom time picked from the Calendar may be a meeting that has no link yet: the time is what the parent needs,
-- so the link on a lead's Zoom meeting can be empty (the message then leaves the link line out).
alter table public.lead_zoom_meetings drop constraint if exists lead_zoom_meetings_link_check;
alter table public.lead_zoom_meetings
  add constraint lead_zoom_meetings_link_check check (char_length(btrim(link)) <= 500);
