-- Late photos: at least a couple of days (10 Nov 2026). Late photos were allowed until the end of the shift's
-- fortnight, so a shift on the fortnight's last day (a Sunday night) lost its late time within hours. Now they're
-- allowed until the end of the fortnight or the end of the late_photo_min_days-th day after the shift, whichever
-- is later. Photos never change hours, so this can't affect the fortnight's pay export.
-- Mirrors photoLateUntil() in src/lib/rules.ts.

alter table site_settings
  add column late_photo_min_days integer not null default 2 check (late_photo_min_days >= 0);

-- The last moment late photos can be added: midnight local time, at the later of the next fortnight's start and
-- the day after the late_photo_min_days-th day after the shift.
create or replace function private.photo_late_until(p_day date) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select (greatest(private.fortnight_start_of(p_day) + 14, p_day + 1 + s.late_photo_min_days)::timestamp at time zone s.timezone)
  from public.site_settings s
$$;
