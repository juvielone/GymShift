-- No-show fixes (found 18 Nov 2026, when the 16–29 Nov fortnight was published after some of its shifts had passed).
--
-- 1. A moved shift starts its no-show check again. When a published shift's date, start time or person changes,
--    its open no-show flag is resolved (by the person who changed it, when they changed it, with a note saying
--    why), and the job checks the shift again at its new time. Before this, the old no-show stayed on the shift,
--    the job never checked the new slot, and an on-time clock-in "resolved" it and raised a late-start flag.
--    Clock events are not touched: a session keeps its clock-in, shift and times.
-- 2. A shift rostered after it was due is not a no-show. The person could only have known about a shift from
--    the moment it was published, moved or given to them (whichever is latest). If that moment is after the
--    no-show time, nobody is flagged: it's late paperwork, not a missed shift (rosteredInTime() in
--    src/lib/rules.ts; the roster's publish confirm warns about it).
-- 3. Clocking in only turns the clocking-in person's own no-show into a late start.
--
-- Flags gain resolved_note: why a flag was resolved when the app resolved it ("Shift moved to Wed 18 Nov, 8:00 pm",
-- "Clocked in"). Null when Carly resolves it herself. Set together with resolved_at, once, like the rest.
-- Flags already resolved stay exactly as they are; nothing is deleted.
-- Replaces clock_in() and raise_due_flags() from 18_shift_from_clock_in; only the parts above change.

-- ---- Flags: why it was resolved ----

alter table public.flags
  add column resolved_note text,
  add constraint flags_note_when_resolved check (resolved_note is null or resolved_at is not null);

drop trigger flags_resolve_once on public.flags;
create trigger flags_resolve_once before update on public.flags
  for each row execute function private.set_once('resolved_at', 'resolved_by', 'resolved_note');

-- set_once lets a still-empty column be filled later; the note only comes with the resolving itself.
create function private.flag_note_with_resolve() returns trigger
language plpgsql as $$
begin
  if old.resolved_at is not null and new.resolved_note is distinct from old.resolved_note then
    raise exception 'A flag''s note is written when it is resolved and can''t be changed';
  end if;
  return new;
end $$;

create trigger flags_note_with_resolve before update on public.flags
  for each row execute function private.flag_note_with_resolve();

-- ---- 1. A moved shift starts its no-show check again ----

-- "Shift moved to Wed 18 Nov, 8:00 pm" / "Shift reassigned" / both (noShowResetNote() in src/data/shifts.ts).
create function private.shift_moved_note(sh public.shifts, p_moved boolean, p_reassigned boolean, tz text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_moved and p_reassigned then 'Shift reassigned and moved to '
    when p_moved then 'Shift moved to '
    else 'Shift reassigned'
  end
  || case when p_moved
       then to_char(sh.date, 'Dy FMDD Mon') || ', ' || private.fmt_local_time(private.shift_start_at(sh, tz), tz)
       else '' end
$$;

-- After a published shift's date, start time or person changes (an edit or an approved swap). The change itself
-- is logged by shifts_change (who, when, old, new); this resolves the shift's open no-show by the same person at
-- the same moment, so the log and the flag line up. Only flags change: clock events and hours are untouched.
create function private.reset_no_show_on_move() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  moved boolean := new.date is distinct from old.date or new.start_time is distinct from old.start_time;
  reassigned boolean := new.assigned_user_id is distinct from old.assigned_user_id;
begin
  if old.status <> 'published' or new.status <> 'published' or not (moved or reassigned) then
    return null;
  end if;
  update public.flags f
  set resolved_at = now(), resolved_by = auth.uid(),
      resolved_note = private.shift_moved_note(new, moved, reassigned, (select s.timezone from public.site_settings s))
  where f.shift_id = new.id and f.kind = 'no_show' and f.resolved_at is null;
  return null;
end $$;

create trigger shifts_reset_no_show after update on public.shifts
  for each row execute function private.reset_no_show_on_move();

-- When a shift last moved or changed hands (logged changes to its date, start time or person), else null.
create function private.shift_moved_at(p_shift_id uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(c.changed_at) from public.shift_changes c
  where c.shift_id = p_shift_id and c.field in ('date', 'start_time', 'assigned_user_id')
$$;

-- ---- 3. Clock in: only your own no-show becomes your late start ----

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
    -- Their own no-show becomes their late start: resolved by them arriving, and the start flagged instead.
    update public.flags f set resolved_at = now(), resolved_by = me, resolved_note = 'Clocked in'
    where f.shift_id = linked.id and f.kind = 'no_show' and f.user_id = me and f.resolved_at is null;
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

-- ---- 2. The scheduled job ----

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
  -- Every time here is a timestamptz (an instant): the start is the shift's local date and time read in the site's
  -- timezone, so it compares correctly with published_at and changed_at whatever the server's timezone.
  for r in
    select sh.id, sh.assigned_user_id,
      greatest(private.shift_start_at(sh, s.timezone), coalesce(late.arrive_by, '-infinity')) + make_interval(mins => s.no_show_after_min) as due,
      -- When they could first have known about the shift as it is now (rosteredInTime() in rules.ts).
      greatest(sh.published_at, moved.at) as noticed_at
    from public.shifts sh
    cross join lateral (select private.shift_moved_at(sh.id) as at) moved
    left join lateral (
      select n.arrive_by from public.notes n
      where n.shift_id = sh.id and n.user_id = sh.assigned_user_id and n.tag = 'running_late'
      order by n.created_at desc limit 1
    ) late on true
    where sh.status = 'published'
      and sh.date between (now() at time zone s.timezone)::date - 3 and (now() at time zone s.timezone)::date
      and not exists (select 1 from public.clock_events e where e.shift_id = sh.id and e.kind = 'in' and not private.is_voided(e.id))
      -- Raised once per version of the shift: a no-show from before its last move doesn't count.
      and not exists (select 1 from public.flags f where f.shift_id = sh.id and f.kind = 'no_show' and f.created_at >= coalesce(moved.at, '-infinity'))
  loop
    continue when r.due > now() or r.due < now() - look_back;
    -- Rostered after it was due: they couldn't have come. Not a no-show.
    continue when r.noticed_at > r.due;
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

-- ---- Privileges ----

revoke all on function private.flag_note_with_resolve() from public, anon, authenticated;
revoke all on function private.shift_moved_note(public.shifts, boolean, boolean, text) from public, anon, authenticated;
revoke all on function private.reset_no_show_on_move() from public, anon, authenticated;
revoke all on function private.shift_moved_at(uuid) from public, anon, authenticated;
