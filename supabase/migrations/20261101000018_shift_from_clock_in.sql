-- The roster time is a guide (agreed with Carly, 8 Nov 2026). Cleaners often arrive up to an hour early or late,
-- and that's fine as long as they work their full shift from when they clock in. So:
--   - A session's expected finish is its clock-in plus its approved length (3h plus approved extra time), not the
--     rostered end. The missing clock-out flag and the automatic close count from it (expectedEnd: assumedEnd()
--     and missingOutDueAt() in src/lib/rules.ts; keep them in step).
--   - The start window and the no-show window widen from 30 and 15 minutes to 90.
--   - Time over the approved length is flagged only past a leeway (over_length_grace_min, 10 minutes):
--     isOverApproved() in src/lib/rules.ts. Flag only: every minute worked is paid (rule 3).
--   - Clocking in on a shift that already has a no-show flag resolves it and flags the late start instead, so
--     Carly sees one flag for one late arrival (clockIn() in src/data/clockEvents.ts).
-- Replaces clock_in(), clock_out(), settle_session_flags(), raise_due_flags() and close_forgotten_sessions()
-- from 12_attendance_fixes; only the parts above change.

-- ---- Settings ----

alter table site_settings
  -- Minutes over the approved length allowed before the over-length flag. Flag only: all of it is paid.
  add column over_length_grace_min integer not null default 10 check (over_length_grace_min >= 0),
  alter column start_mismatch_min set default 90;

-- Only rows still on the old defaults: a value Carly chose stays.
update site_settings set no_show_after_min = 90 where no_show_after_min = 15;
update site_settings set start_mismatch_min = 90 where start_mismatch_min = 30;

-- ---- Helpers ----

-- Worked time beyond the approved length plus the leeway (isOverApproved() in src/lib/rules.ts).
create function private.is_over_length(p_worked integer, p_approved integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_worked > p_approved + (select s.over_length_grace_min from public.site_settings s)
$$;

-- When a session is expected to finish: its clock-in plus the approved length (assumedEnd() in src/lib/rules.ts).
create function private.expected_end(p_in_id uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select private.effective_time(e.id) + make_interval(mins => private.approved_min_for(e.shift_id))
  from public.clock_events e where e.id = p_in_id
$$;

-- ---- Clock in / out ----

create or replace function public.clock_in(
  p_location_status public.location_status,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy_m double precision default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_staff();
  s public.site_settings;
  open_in public.clock_events := private.open_clock_in(me);
  linked public.shifts;
  ev public.clock_events;
  start_at timestamptz;
  off_by integer;
  no_shows integer := 0;
begin
  select * into s from public.site_settings;
  if open_in.id is not null then
    -- The phone shows "You're already clocked in since …" with Clock out / Cancel; detail carries the time.
    raise exception 'You''re already clocked in since %', private.fmt_local_time(private.effective_time(open_in.id), s.timezone)
      using errcode = 'GS409', detail = to_char(private.effective_time(open_in.id) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  select sh.* into linked
  from public.shifts sh
  where sh.assigned_user_id = me and sh.status = 'published' and sh.date = (now() at time zone s.timezone)::date
    and not exists (
      select 1 from public.clock_events e
      where e.shift_id = sh.id and e.kind = 'in' and not private.is_voided(e.id)
        and not exists (select 1 from public.correction_requests r where r.clock_event_id = e.id and r.kind = 'void' and r.status = 'pending'))
  order by sh.start_time
  limit 1;

  ev := private.append_clock_event(me, linked.id, 'in', p_location_status, p_lat, p_lng, p_accuracy_m);
  if linked.id is null then
    perform private.raise_flag('unscheduled', me, null, ev.id, 'Clock-in with no rostered shift');
  else
    -- A no-show already raised becomes their late start: resolved by them arriving, and the start flagged instead.
    update public.flags f set resolved_at = now(), resolved_by = me
    where f.shift_id = linked.id and f.kind = 'no_show' and f.resolved_at is null;
    get diagnostics no_shows = row_count;
    -- Far from the rostered start, early or late (minutesFromStart() in src/lib/rules.ts). Flag only.
    start_at := private.shift_start_at(linked, s.timezone);
    off_by := round(extract(epoch from ev.server_time - start_at) / 60);
    if no_shows > 0 or abs(off_by) > s.start_mismatch_min then
      perform private.raise_flag('off_start', me, linked.id, ev.id,
        format('Clock-in %s %s the %s start', private.fmt_min(abs(off_by)), case when off_by < 0 then 'before' else 'after' end, private.fmt_local_time(start_at, s.timezone)));
    end if;
  end if;
  return private.clock_result(ev);
end $$;

-- Closes the caller's open session. Time over the approved length plus the leeway is flagged, never cut; so is
-- a session of a minute or two.
create or replace function public.clock_out(
  p_location_status public.location_status,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy_m double precision default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_staff();
  s public.site_settings;
  open_in public.clock_events := private.open_clock_in(me);
  ev public.clock_events;
  worked integer;
  approved integer;
begin
  select * into s from public.site_settings;
  ev := private.append_clock_event(me, open_in.shift_id, 'out', p_location_status, p_lat, p_lng, p_accuracy_m);

  if open_in.id is not null then
    worked := private.session_min(open_in.id, ev.id);
    if worked < s.short_session_flag_min then
      perform private.raise_flag('short_session', me, open_in.shift_id, ev.id, format('Clocked out %s min after clocking in', worked));
    end if;
    if open_in.shift_id is not null then
      approved := private.approved_shift_min(open_in.shift_id);
      if private.is_over_length(worked, approved) then
        perform private.raise_flag('over_without_extension', me, open_in.shift_id, ev.id, format('Recorded %s; approved %s', private.fmt_min(worked), private.fmt_min(approved)));
      end if;
    end if;
  end if;
  return private.clock_result(ev);
end $$;

-- Once a session's end is settled (a request approved, an extension approved): its missing clock-out flag is
-- done, and its over-length flag too when the approved length (plus the leeway) now covers the time worked.
create or replace function private.settle_session_flags(p_out_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ev public.clock_events;
  clock_in public.clock_events := private.paired_in(p_out_id);
begin
  select * into ev from public.clock_events e where e.id = p_out_id;
  if clock_in.id is null then
    return;
  end if;
  update public.flags f set resolved_at = now(), resolved_by = me
  where f.clock_event_id = clock_in.id and f.kind = 'missing_clock_out' and f.resolved_at is null;
  if not private.is_over_length(private.session_min(clock_in.id, p_out_id), private.approved_min_for(ev.shift_id)) then
    update public.flags f set resolved_at = now(), resolved_by = me
    where f.clock_event_id = p_out_id and f.kind = 'over_without_extension' and f.resolved_at is null;
  end if;
end $$;

-- ---- The scheduled job ----

create or replace function private.raise_due_flags() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.site_settings;
  -- Only recent shifts and sessions: switching the job on doesn't flag months of old test data.
  look_back constant interval := interval '2 days';
  raised integer := 0;
  r record;
begin
  -- One run at a time, if a run is ever slow.
  if not pg_try_advisory_xact_lock(hashtext('gymshift:raise_due_flags')) then
    return 0;
  end if;
  select * into s from public.site_settings;

  -- No-show: still from the rostered start (or the "running late" note's time), noShowDueAt() in rules.ts.
  for r in
    select sh.id, sh.assigned_user_id,
      greatest(private.shift_start_at(sh, s.timezone), coalesce(late.arrive_by, '-infinity')) + make_interval(mins => s.no_show_after_min) as due
    from public.shifts sh
    left join lateral (
      select n.arrive_by from public.notes n
      where n.shift_id = sh.id and n.user_id = sh.assigned_user_id and n.tag = 'running_late'
      order by n.created_at desc limit 1
    ) late on true
    where sh.status = 'published'
      and sh.date between (now() at time zone s.timezone)::date - 3 and (now() at time zone s.timezone)::date
      and not exists (select 1 from public.clock_events e where e.shift_id = sh.id and e.kind = 'in' and not private.is_voided(e.id))
      and not exists (select 1 from public.flags f where f.shift_id = sh.id and f.kind = 'no_show')
  loop
    continue when r.due > now() or r.due < now() - look_back;
    perform private.raise_flag('no_show', r.assigned_user_id, r.id, null, 'No clock-in by ' || private.fmt_local_time(r.due, s.timezone));
    raised := raised + 1;
  end loop;

  -- Missing clock-out: from the expected finish, clock-in plus the approved length (missingOutDueAt()).
  for r in
    select e.id, e.user_id, e.shift_id, private.expected_end(e.id) + make_interval(mins => s.missing_out_after_min) as due
    from public.clock_events e
    where e.kind = 'in' and not private.is_voided(e.id)
      and e.server_time > now() - look_back - interval '1 day'
      -- Closed only when the person's very next counting clock event is a clock-out (as clock_out() pairs them).
      and private.paired_out(e.id) is null
      and not exists (select 1 from public.flags f where f.clock_event_id = e.id and f.kind = 'missing_clock_out')
  loop
    continue when r.due > now() or r.due < now() - look_back;
    perform private.raise_flag('missing_clock_out', r.user_id, r.shift_id, r.id, 'No clock-out by ' || private.fmt_local_time(r.due, s.timezone));
    raised := raised + 1;
  end loop;

  return raised;
end $$;

-- A session still open auto_close_after_min after its expected finish is closed AT that finish (autoCloseDueAt()
-- and assumedEnd() in src/lib/rules.ts). The new 'out' event has no location (nobody's phone made it) and is
-- labelled 'auto'. Returns how many it closed.
create or replace function private.close_forgotten_sessions() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.site_settings;
  look_back constant interval := interval '2 days';
  closed integer := 0;
  r record;
begin
  if not pg_try_advisory_xact_lock(hashtext('gymshift:close_forgotten_sessions')) then
    return 0;
  end if;
  select * into s from public.site_settings;

  for r in
    select e.id, e.user_id, e.shift_id, private.expected_end(e.id) as assumed_end
    from public.clock_events e
    where e.kind = 'in' and not private.is_voided(e.id)
      and e.server_time > now() - look_back - interval '1 day'
      and private.paired_out(e.id) is null
  loop
    continue when r.assumed_end + make_interval(mins => s.auto_close_after_min) > now()
      or r.assumed_end + make_interval(mins => s.auto_close_after_min) < now() - look_back;
    -- Never at the same moment as the person's own clock-out; then check it is still the open one.
    perform pg_advisory_xact_lock(hashtext('clock:' || r.user_id::text));
    continue when (private.open_clock_in(r.user_id)).id is distinct from r.id;

    -- Carly hears about it even if the 30-minute check never ran.
    if not exists (select 1 from public.flags f where f.clock_event_id = r.id and f.kind = 'missing_clock_out') then
      perform private.raise_flag('missing_clock_out', r.user_id, r.shift_id, r.id,
        'No clock-out by ' || private.fmt_local_time(r.assumed_end + make_interval(mins => s.missing_out_after_min), s.timezone));
    end if;
    insert into public.clock_events (user_id, shift_id, kind, location_status, source, assumed_time)
    values (r.user_id, r.shift_id, 'out', 'unavailable', 'auto', r.assumed_end);
    closed := closed + 1;
  end loop;
  return closed;
end $$;

-- ---- Privileges ----

revoke all on function private.is_over_length(integer, integer) from public, anon, authenticated;
revoke all on function private.expected_end(uuid) from public, anon, authenticated;
