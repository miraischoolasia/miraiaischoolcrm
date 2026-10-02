-- One way of writing a lead's phone number: the country code and the number,
-- digits only, no plus sign and no leading 0 (60123456789). Numbers from a
-- form (+60123456789), typed by staff (012-345 6789), imported or sent by the
-- API all end up like that, and the leads already saved are rewritten once.
--
-- * A number starting with 0 is Malaysian: the 0 becomes 60.
-- * A number starting with 00 is written with the international prefix: the 00
--   is dropped.
-- * Anything else is kept as its digits (60..., +65 9123 4567 -> 6591234567).
-- * Text that is not a plain number (it has letters, or fewer than 8 or more
--   than 15 digits) is left exactly as it was.

create or replace function public.to_lead_phone(p_phone text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
begin
  if p_phone is null or p_phone ~ '[A-Za-z]' then
    return p_phone;
  end if;

  v_digits := regexp_replace(p_phone, '\D', '', 'g');

  if v_digits like '00%' then
    v_digits := substr(v_digits, 3);
  elsif v_digits like '0%' then
    v_digits := '60' || substr(v_digits, 2);
  end if;

  if char_length(v_digits) < 8 or char_length(v_digits) > 15 then
    return p_phone;
  end if;

  return v_digits;
end;
$$;

revoke all on function public.to_lead_phone(text) from public, anon;
grant execute on function public.to_lead_phone(text) to authenticated;

-- Applies the same to the lead's own number and to each child's number.
create or replace function public.leads_format_phones()
returns trigger
language plpgsql
as $$
begin
  new.phone := public.to_lead_phone(new.phone);

  if new.children is not null and jsonb_typeof(new.children) = 'array' then
    new.children := coalesce(
      (
        select jsonb_agg(
          case
            when jsonb_typeof(child) = 'object' and jsonb_typeof(child -> 'phone') = 'string'
              then jsonb_set(child, '{phone}', to_jsonb(public.to_lead_phone(child ->> 'phone')))
            else child
          end
          order by position
        )
        from jsonb_array_elements(new.children) with ordinality as entries(child, position)
      ),
      '[]'::jsonb
    );
  end if;

  return new;
end;
$$;

revoke all on function public.leads_format_phones() from public, anon, authenticated;

drop trigger if exists leads_format_phones on public.leads;
create trigger leads_format_phones
before insert or update of phone, children on public.leads
for each row execute function public.leads_format_phones();

-- The leads already saved. Setting the phone fires the trigger above, which
-- rewrites the children's numbers too; rows that are already in this form are
-- not touched.
update public.leads
set phone = public.to_lead_phone(phone)
where phone is distinct from public.to_lead_phone(phone)
   or exists (
     select 1
     from jsonb_array_elements(case when jsonb_typeof(children) = 'array' then children else '[]'::jsonb end) child
     where jsonb_typeof(child) = 'object'
       and jsonb_typeof(child -> 'phone') = 'string'
       and (child ->> 'phone') is distinct from public.to_lead_phone(child ->> 'phone')
   );
