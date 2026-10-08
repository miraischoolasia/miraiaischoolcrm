-- Which Malaysian state a lead lives in. Optional; chosen from a fixed list so the
-- spelling is always the same and the Leads list can be sorted or filtered by it.

alter table public.leads
  add column if not exists state text;

alter table public.leads
  drop constraint if exists leads_state_check;
alter table public.leads
  add constraint leads_state_check check (
    state is null or state in (
      'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis',
      'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
      'Kuala Lumpur', 'Labuan', 'Putrajaya'
    )
  );
