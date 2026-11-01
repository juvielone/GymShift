-- Clock in / clock out (PRD F4). The phone sends only where it is (or why it doesn't know); the
-- database stamps the time with now(), works out the distance from the gym and raises flags.
-- Nothing here blocks: off-site, no location and unscheduled clock events always save, then flag.
-- Same behaviour and flag wording as src/data/clockEvents.ts.

-- Great-circle distance in metres (haversine), as distanceMetres() in src/lib/rules.ts.
create function private.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- "200" → "3h 20m", as formatMinutes() in src/lib/rules.ts.
create function private.fmt_min(minutes integer) returns text
language sql immutable set search_path = '' as $$
  select (minutes / 60) || 'h ' || (minutes % 60) || 'm'
$$;

-- The latest correction's new time, else the time the server recorded. The event itself never changes.
create function private.effective_time(event_id uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.new_time from public.corrections c where c.clock_event_id = event_id order by c.created_at desc limit 1),
    (select e.server_time from public.clock_events e where e.id = event_id))
$$;

-- Standard length plus approved extra time, never beyond the maximum (approvedShiftMinutes()).
create function private.approved_shift_min(p_shift_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select least(s.standard_shift_min + coalesce((select sum(x.minutes) from public.extensions x where x.shift_id = p_shift_id and x.status = 'approved'), 0), s.max_shift_min)::integer
  from public.site_settings s
$$;

create function private.raise_flag(p_kind public.flag_kind, p_user_id uuid, p_shift_id uuid, p_clock_event_id uuid, p_detail text)
returns void
language sql security definer set search_path = '' as $$
  insert into public.flags (kind, user_id, shift_id, clock_event_id, detail) values (p_kind, p_user_id, p_shift_id, p_clock_event_id, p_detail)
$$;

-- The caller, who must be an active member of staff. One clock action per person at a time.
create function private.require_staff() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not exists (select 1 from public.users u where u.id = me and u.active) then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('clock:' || me::text));
  return me;
end $$;

-- Saves one clock event at now() and its location flags. A fix that isn't usable counts as 'unavailable'.
create function private.append_clock_event(
  p_user_id uuid, p_shift_id uuid, p_kind public.clock_kind,
  p_location_status public.location_status, p_lat double precision, p_lng double precision, p_accuracy_m double precision
) returns public.clock_events
language plpgsql security definer set search_path = '' as $$
declare
  s public.site_settings;
  ev public.clock_events;
  status public.location_status := p_location_status;
  label text := case p_kind when 'in' then 'Clock-in' else 'Clock-out' end;
begin
  select * into s from public.site_settings;
  if status = 'ok' and (p_lat is null or p_lng is null or p_accuracy_m is null
      or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy_m < 0) then
    status := 'unavailable';
  end if;

  if status = 'ok' then
    insert into public.clock_events (user_id, shift_id, kind, location_status, lat, lng, accuracy_m, distance_m)
    values (p_user_id, p_shift_id, p_kind, 'ok', p_lat, p_lng, p_accuracy_m, round(private.distance_m(p_lat, p_lng, s.gym_lat, s.gym_lng)))
    returning * into ev;
    -- Off-site means distance minus accuracy is beyond the radius; poor accuracy alone never flags.
    if ev.distance_m - ev.accuracy_m > s.radius_m then
      perform private.raise_flag('off_site', p_user_id, p_shift_id, ev.id, format('%s %s m from gym (±%s m)', label, ev.distance_m, ev.accuracy_m));
    end if;
  else
    insert into public.clock_events (user_id, shift_id, kind, location_status)
    values (p_user_id, p_shift_id, p_kind, status)
    returning * into ev;
    perform private.raise_flag('no_location', p_user_id, p_shift_id, ev.id, format('%s: location %s', label, status));
  end if;
  return ev;
end $$;

create function private.clock_result(ev public.clock_events) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'event', to_jsonb(ev),
    'flags', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at, f.kind) from public.flags f where f.clock_event_id = ev.id), '[]'::jsonb))
$$;

-- Links to the caller's published shift for today (site timezone) with no clock-in yet; otherwise unscheduled.
create function public.clock_in(
  p_location_status public.location_status,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy_m double precision default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_staff();
  today date := (now() at time zone (select s.timezone from public.site_settings s))::date;
  linked uuid;
  ev public.clock_events;
begin
  select sh.id into linked
  from public.shifts sh
  where sh.assigned_user_id = me and sh.status = 'published' and sh.date = today
    and not exists (select 1 from public.clock_events e where e.shift_id = sh.id and e.kind = 'in')
  order by sh.start_time
  limit 1;

  ev := private.append_clock_event(me, linked, 'in', p_location_status, p_lat, p_lng, p_accuracy_m);
  if linked is null then
    perform private.raise_flag('unscheduled', me, null, ev.id, 'Clock-in with no rostered shift');
  end if;
  return private.clock_result(ev);
end $$;

-- Closes the caller's open session. Time over the approved length is flagged, never cut.
create function public.clock_out(
  p_location_status public.location_status,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy_m double precision default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_staff();
  open_in public.clock_events;
  linked uuid;
  ev public.clock_events;
  worked integer;
  approved integer;
begin
  select * into open_in from public.clock_events e where e.user_id = me order by e.server_time desc limit 1;
  if found and open_in.kind = 'in' then
    linked := open_in.shift_id;
  end if;

  ev := private.append_clock_event(me, linked, 'out', p_location_status, p_lat, p_lng, p_accuracy_m);

  if linked is not null then
    worked := round(extract(epoch from ev.server_time - private.effective_time(open_in.id)) / 60);
    approved := private.approved_shift_min(linked);
    if worked > approved then
      perform private.raise_flag('over_without_extension', me, linked, ev.id, format('Recorded %s; approved %s', private.fmt_min(worked), private.fmt_min(approved)));
    end if;
  end if;
  return private.clock_result(ev);
end $$;

-- Only signed-in staff can call these; the helpers above stay private.
revoke all on function public.clock_in(public.location_status, double precision, double precision, double precision) from public, anon;
revoke all on function public.clock_out(public.location_status, double precision, double precision, double precision) from public, anon;
grant execute on function public.clock_in(public.location_status, double precision, double precision, double precision) to authenticated;
grant execute on function public.clock_out(public.location_status, double precision, double precision, double precision) to authenticated;
-- Helpers that write stay callable only from inside the functions above (they run as the owner).
revoke all on function private.raise_flag(public.flag_kind, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.append_clock_event(uuid, uuid, public.clock_kind, public.location_status, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function private.require_staff() from public, anon, authenticated;
revoke all on function private.effective_time(uuid) from public, anon, authenticated;
revoke all on function private.approved_shift_min(uuid) from public, anon, authenticated;
revoke all on function private.clock_result(public.clock_events) from public, anon, authenticated;
