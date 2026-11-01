-- Flags that depend on time passing (PRD F6): possible no-show and missing clock-out. Nobody's phone
-- raises these, so a scheduled job (pg_cron) runs private.raise_due_flags() every few minutes.
-- Windows come from site_settings. Each flag is raised once; Carly resolves it. Nothing is cut or changed.
--   no_show: a published shift with no clock-in, no_show_after_min after it starts, or after the time the
--     cleaner's latest "running late" note said they'd arrive, whichever is later (noShowDueAt() in
--     src/lib/rules.ts).
--   missing_clock_out: a clock-in never followed by a clock-out, missing_out_after_min after the shift
--     ends (plus approved extra time). With no shift, the end is clock-in plus the standard length.

-- When a shift starts and ends, in the site's timezone. A shift ending at or before its start ends the next day.
create function private.shift_start_at(sh public.shifts, tz text) returns timestamptz
language sql immutable set search_path = '' as $$
  select (sh.date + sh.start_time) at time zone tz
$$;

create function private.shift_end_at(sh public.shifts, tz text) returns timestamptz
language sql immutable set search_path = '' as $$
  select (sh.date + sh.end_time + case when sh.end_time <= sh.start_time then interval '1 day' else interval '0' end) at time zone tz
$$;

-- "7:15 pm" in the site's timezone, as the flag details read.
create function private.fmt_local_time(t timestamptz, tz text) returns text
language sql immutable set search_path = '' as $$
  select to_char(t at time zone tz, 'FMHH12:MI am')
$$;

-- Raises every flag that has come due and not been raised yet. Returns how many it raised.
create function private.raise_due_flags() returns integer
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
      and not exists (select 1 from public.clock_events e where e.shift_id = sh.id and e.kind = 'in')
      and not exists (select 1 from public.flags f where f.shift_id = sh.id and f.kind = 'no_show')
  loop
    continue when r.due > now() or r.due < now() - look_back;
    perform private.raise_flag('no_show', r.assigned_user_id, r.id, null, 'No clock-in by ' || private.fmt_local_time(r.due, s.timezone));
    raised := raised + 1;
  end loop;

  for r in
    select e.id, e.user_id, e.shift_id,
      case when sh.id is null then e.server_time + make_interval(mins => s.standard_shift_min)
        else private.shift_end_at(sh, s.timezone) + make_interval(mins => private.approved_shift_min(sh.id) - s.standard_shift_min)
      end + make_interval(mins => s.missing_out_after_min) as due
    from public.clock_events e
    left join public.shifts sh on sh.id = e.shift_id
    where e.kind = 'in'
      and e.server_time > now() - look_back - interval '1 day'
      -- Closed only when the person's very next clock event is a clock-out (as clock_out() pairs them).
      and coalesce((
        select nx.kind from public.clock_events nx
        where nx.user_id = e.user_id and nx.server_time > e.server_time
        order by nx.server_time limit 1), 'in') <> 'out'
      and not exists (select 1 from public.flags f where f.clock_event_id = e.id and f.kind = 'missing_clock_out')
  loop
    continue when r.due > now() or r.due < now() - look_back;
    perform private.raise_flag('missing_clock_out', r.user_id, r.shift_id, r.id, 'No clock-out by ' || private.fmt_local_time(r.due, s.timezone));
    raised := raised + 1;
  end loop;

  return raised;
end $$;

revoke all on function private.raise_due_flags() from public, anon, authenticated;
revoke all on function private.shift_start_at(public.shifts, text) from public, anon, authenticated;
revoke all on function private.shift_end_at(public.shifts, text) from public, anon, authenticated;
revoke all on function private.fmt_local_time(timestamptz, text) from public, anon, authenticated;

-- Every 5 minutes on Supabase. Skipped where pg_cron isn't available (the in-memory test database).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('gymshift-due-flags', '*/5 * * * *', 'select private.raise_due_flags()');
  end if;
end $$;
