-- Gym location (PRD F4 setup): Carly moves the gym point and radius from her dashboard.
-- Same checks and wording as updateSiteLocation() in src/data/settings.ts. New clock events use the
-- new point; past events keep the distance saved with them, so nothing already recorded changes.

create function public.update_site_location(p_lat double precision, p_lng double precision, p_radius_m integer)
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

  update public.site_settings
  set gym_lat = p_lat, gym_lng = p_lng, radius_m = p_radius_m, updated_by = me, updated_at = now()
  returning * into saved;
  return saved;
end $$;

revoke all on function public.update_site_location(double precision, double precision, integer) from public, anon;
grant execute on function public.update_site_location(double precision, double precision, integer) to authenticated;
