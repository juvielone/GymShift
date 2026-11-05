-- Fix: Carly couldn't save the gym location in the live app (found 6 Nov 2026).
-- Supabase loads pg_safeupdate for requests from the app, which refuses any UPDATE or DELETE without a WHERE
-- clause (error 21000, "UPDATE requires a WHERE clause"), even inside a function. update_site_location()
-- updated the one site_settings row without one, so every save failed and the app showed "check your
-- internet". Same function and checks as 05_site_location; only the WHERE is new.
-- supabase/tests/db.test.mjs checks that no function in the database updates or deletes without a WHERE.

create or replace function public.update_site_location(p_lat double precision, p_lng double precision, p_radius_m integer)
returns public.site_settings
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  saved public.site_settings;
begin
  if not coalesce((select r.can_manage_users from private.my_role() r where r.id is not null), false) then
    raise exception 'Only the manager can change site settings' using errcode = '42501';
  end if;
  if p_lat is null or p_lat not between -90 and 90 then
    raise exception 'Latitude must be between -90 and 90';
  end if;
  if p_lng is null or p_lng not between -180 and 180 then
    raise exception 'Longitude must be between -180 and 180';
  end if;
  -- The same bounds as the table check (RADIUS_MIN_M / RADIUS_MAX_M in src/data/settings.ts).
  if p_radius_m is null or p_radius_m not between 50 and 300 then
    raise exception 'Radius must be 50–300 m';
  end if;

  -- site_settings holds exactly one row (one site in v1); the WHERE is for pg_safeupdate.
  update public.site_settings
  set gym_lat = p_lat, gym_lng = p_lng, radius_m = p_radius_m, updated_by = me, updated_at = now()
  where true
  returning * into saved;
  return saved;
end $$;
