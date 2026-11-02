-- Attendance fixes (PRD F6): mistaken clock-ins, late clock-outs and forgotten clock-outs.
-- Same checks and wording as src/data/attendanceFixes.ts, clockEvents.ts, extensions.ts and corrections.ts.
--
-- Nothing is overwritten or deleted (CLAUDE.md rule 2):
--   - A mistaken clock-in is voided: a clock_voids row says the event no longer counts. The event stays.
--   - A forgotten clock-out is closed by the scheduled job with a NEW 'out' event (source 'auto') whose
--     assumed_time is the rostered end. Nobody measured that end, so nothing measured is cut (rule 3); it is
--     labelled, flagged, and the cleaner confirms or corrects it.
--   - A cleaner's "this is wrong" is a correction_requests row, decided once by Carly. Approving a void
--     writes clock_voids; approving an end time writes a corrections row.
-- Effective time of an event: the latest correction, else its assumed_time, else the time the server recorded.

-- ---- Settings ----

alter table site_settings
  -- A clock-in further than this from the rostered start asks first on the phone, and is flagged.
  add column start_mismatch_min integer not null default 30 check (start_mismatch_min > 0),
  -- A session shorter than this is flagged (a tap on Clock out straight after Clock in).
  add column short_session_flag_min integer not null default 2 check (short_session_flag_min >= 0),
  -- A session still open this long after the shift's approved end is closed at that end.
  add column auto_close_after_min integer not null default 120 check (auto_close_after_min > 0);

-- ---- Clock events closed by the scheduled job ----

alter table clock_events
  add column source clock_source not null default 'phone',
  add column assumed_time timestamptz,
  add constraint clock_events_auto_is_out check (source = 'phone' or kind = 'out'),
  add constraint clock_events_auto_assumed check ((source = 'auto') = (assumed_time is not null));

-- ---- A cleaner's request to fix an entry ----

create table correction_requests (
  id uuid primary key default gen_random_uuid(),
  kind correction_request_kind not null,
  -- 'void': the clock-in made by mistake. 'end_time': the clock-out whose time is wrong.
  clock_event_id uuid not null references clock_events (id),
  requested_by uuid not null references users (id),
  reason_code correction_reason not null,
  note text,
  -- 'end_time' only: when they say they finished.
  requested_time timestamptz,
  status request_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_by uuid references users (id),
  decided_at timestamptz,
  check ((kind = 'end_time') = (requested_time is not null)),
  check ((kind = 'void' and reason_code in ('accidental_tap', 'wrong_time', 'other'))
      or (kind = 'end_time' and reason_code in ('forgot_clock_out', 'confirm_auto_close', 'other'))),
  check (reason_code <> 'other' or btrim(coalesce(note, '')) <> ''),
  check ((status = 'pending') = (decided_by is null and decided_at is null))
);
create index correction_requests_event_idx on correction_requests (clock_event_id);
-- One open request per clock event at a time.
create unique index correction_requests_one_pending on correction_requests (clock_event_id) where status = 'pending';

-- ---- Voids: append-only, one per clock event ----

create table clock_voids (
  id uuid primary key default gen_random_uuid(),
  clock_event_id uuid not null unique references clock_events (id),
  -- The event's effective time when it was voided.
  old_time timestamptz not null,
  reason text not null check (btrim(reason) <> ''),
  voided_by uuid not null references users (id),
  voided_at timestamptz not null default now(),
  -- The cleaner's request this answered; null when Carly voided it directly.
  correction_request_id uuid references correction_requests (id)
);

create trigger clock_voids_append_only before update or delete on clock_voids for each row execute function private.forbid();
create trigger clock_voids_no_truncate before truncate on clock_voids execute function private.forbid();
create trigger correction_requests_never_deleted before delete on correction_requests for each row execute function private.forbid();
create trigger correction_requests_decide_once before update on correction_requests for each row execute function private.decide_once();

-- ---- Who can read them (SELECT only, like every table) ----

revoke all on clock_voids, correction_requests from anon, authenticated;
grant select on clock_voids, correction_requests to authenticated;
alter table clock_voids enable row level security;
alter table correction_requests enable row level security;
create policy clock_voids_read on clock_voids for select to authenticated
  using (exists (select 1 from public.clock_events e where e.id = clock_event_id and private.can_view_records_of(e.user_id)));
create policy correction_requests_read on correction_requests for select to authenticated
  using (private.can_view_records_of(requested_by));

-- ---- Helpers ----

create function private.is_voided(event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clock_voids v where v.clock_event_id = event_id)
$$;

-- The latest correction's new time, else the time the job assumed, else the time the server recorded.
create or replace function private.effective_time(event_id uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.new_time from public.corrections c where c.clock_event_id = event_id order by c.created_at desc limit 1),
    (select coalesce(e.assumed_time, e.server_time) from public.clock_events e where e.id = event_id))
$$;

-- The person's open clock-in: their latest event that still counts, when it is an 'in'. Nothing if none.
create function private.open_clock_in(p_user_id uuid) returns public.clock_events
language sql stable security definer set search_path = '' as $$
  select last.* from (
    select e.* from public.clock_events e
    where e.user_id = p_user_id and not private.is_voided(e.id)
    order by e.server_time desc limit 1) last
  where last.kind = 'in'
$$;

-- The clock-out that closed a clock-in: the person's next counting event, when it is an 'out'.
create function private.paired_out(p_in_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select nx.id from public.clock_events i
  cross join lateral (
    select e.id, e.kind from public.clock_events e
    where e.user_id = i.user_id and e.server_time > i.server_time and not private.is_voided(e.id)
    order by e.server_time limit 1) nx
  where i.id = p_in_id and nx.kind = 'out'
$$;

-- The clock-in a clock-out closed: the person's previous counting event, when it is an 'in'.
create function private.paired_in(p_out_id uuid) returns public.clock_events
language sql stable security definer set search_path = '' as $$
  select pv.* from public.clock_events o
  cross join lateral (
    select e.* from public.clock_events e
    where e.user_id = o.user_id and e.server_time < o.server_time and not private.is_voided(e.id)
    order by e.server_time desc limit 1) pv
  where o.id = p_out_id and pv.kind = 'in'
$$;

-- Whole minutes between two events' effective times (never clamped).
create function private.session_min(p_in_id uuid, p_out_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select round(extract(epoch from private.effective_time(p_out_id) - private.effective_time(p_in_id)) / 60)::integer
$$;

-- What the session may run to: the shift's approved length, or the standard length when unscheduled.
create function private.approved_min_for(p_shift_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case when p_shift_id is null then (select s.standard_shift_min from public.site_settings s) else private.approved_shift_min(p_shift_id) end
$$;

-- "Josh: accidental tap (note)", for the void or correction row the request becomes.
create function private.request_reason_text(r public.correction_requests) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select split_part(u.full_name, ' ', 1) from public.users u where u.id = r.requested_by), 'Cleaner') || ': ' ||
    case r.reason_code
      when 'accidental_tap' then 'accidental tap'
      when 'wrong_time' then 'wrong time'
      when 'forgot_clock_out' then 'forgot to clock out'
      when 'confirm_auto_close' then 'confirmed the automatic clock-out'
      else btrim(r.note)
    end ||
    case when r.reason_code <> 'other' and btrim(coalesce(r.note, '')) <> '' then ' (' || btrim(r.note) || ')' else '' end
$$;

-- Voids a clock-in and the clock-out that closed it (as the signed-in manager). Their open flags are resolved
-- and any request still waiting on them is answered: the void approved, anything else declined.
create function private.void_session(p_in_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ids uuid[];
  request uuid;
begin
  perform pg_advisory_xact_lock(hashtext('clock:' || (select e.user_id from public.clock_events e where e.id = p_in_id)::text));
  ids := array_remove(array[p_in_id, private.paired_out(p_in_id)], null);
  select r.id into request from public.correction_requests r where r.clock_event_id = p_in_id and r.kind = 'void' and r.status = 'pending';

  insert into public.clock_voids (clock_event_id, old_time, reason, voided_by, correction_request_id)
  select e.id, private.effective_time(e.id), p_reason, me, request
  from public.clock_events e where e.id = any (ids) and not private.is_voided(e.id);

  update public.flags f set resolved_at = now(), resolved_by = me where f.clock_event_id = any (ids) and f.resolved_at is null;
  update public.correction_requests r
  set status = (case when r.kind = 'void' then 'approved' else 'declined' end)::public.request_status, decided_by = me, decided_at = now()
  where r.clock_event_id = any (ids) and r.status = 'pending';
end $$;

-- Once a session's end is settled (a request approved, an extension approved): its missing clock-out flag is
-- done, and its over-length flag too when the approved length now covers the time worked.
create function private.settle_session_flags(p_out_id uuid) returns void
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
  if private.session_min(clock_in.id, p_out_id) <= private.approved_min_for(ev.shift_id) then
    update public.flags f set resolved_at = now(), resolved_by = me
    where f.clock_event_id = p_out_id and f.kind = 'over_without_extension' and f.resolved_at is null;
  end if;
end $$;

create function private.require_manager(message text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select r.can_correct_attendance from private.my_role() r where r.id is not null), false) then
    raise exception '%', message using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- ---- Clock in / out, now skipping voided events (replaces 04_clock) ----

-- Links to the caller's published shift for today with no clock-in that still counts (a voided one, or one
-- waiting on a void request, doesn't hold the shift); otherwise unscheduled. Never a second open clock-in.
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
    -- Far from the rostered start, early or late (minutesFromStart() in src/lib/rules.ts). Flag only.
    start_at := private.shift_start_at(linked, s.timezone);
    off_by := round(extract(epoch from ev.server_time - start_at) / 60);
    if abs(off_by) > s.start_mismatch_min then
      perform private.raise_flag('off_start', me, linked.id, ev.id,
        format('Clock-in %s %s the %s start', private.fmt_min(abs(off_by)), case when off_by < 0 then 'before' else 'after' end, private.fmt_local_time(start_at, s.timezone)));
    end if;
  end if;
  return private.clock_result(ev);
end $$;

-- Closes the caller's open session. Time over the approved length is flagged, never cut; so is a session
-- of a minute or two.
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
      if worked > approved then
        perform private.raise_flag('over_without_extension', me, open_in.shift_id, ev.id, format('Recorded %s; approved %s', private.fmt_min(worked), private.fmt_min(approved)));
      end if;
    end if;
  end if;
  return private.clock_result(ev);
end $$;

-- ---- A cleaner's requests ----

-- "This was a mistake" on the caller's own clock-in. Still open: it is clocked out first (location as for any
-- clock-out, no length flags), so they can clock in properly straight away. Carly decides the request.
create function public.request_void(
  p_clock_event_id uuid,
  p_reason_code public.correction_reason,
  p_note text default null,
  p_location_status public.location_status default 'unavailable',
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy_m double precision default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_staff();
  ev public.clock_events;
  closed public.clock_events;
  saved public.correction_requests;
begin
  select * into ev from public.clock_events e where e.id = p_clock_event_id;
  if not found or ev.user_id <> me then
    raise exception 'You can only ask about your own clock-in' using errcode = '42501';
  end if;
  if ev.kind <> 'in' then
    raise exception 'Only a clock-in can be marked as a mistake';
  end if;
  if private.is_voided(ev.id) then
    raise exception 'This clock-in was already removed';
  end if;
  if exists (select 1 from public.correction_requests r where r.clock_event_id = ev.id and r.status = 'pending') then
    raise exception 'Carly already has this to check';
  end if;
  if exists (select 1 from public.correction_requests r where r.clock_event_id = ev.id and r.kind = 'void' and r.status = 'declined') then
    raise exception 'Carly kept this clock-in';
  end if;
  if p_reason_code is null or p_reason_code not in ('accidental_tap', 'wrong_time', 'other') then
    raise exception 'Pick what happened';
  end if;
  if p_reason_code = 'other' and btrim(coalesce(p_note, '')) = '' then
    raise exception 'Say what happened';
  end if;

  if (private.open_clock_in(me)).id = ev.id then
    closed := private.append_clock_event(me, ev.shift_id, 'out', coalesce(p_location_status, 'unavailable'), p_lat, p_lng, p_accuracy_m);
  end if;
  insert into public.correction_requests (kind, clock_event_id, requested_by, reason_code, note)
  values ('void', ev.id, me, p_reason_code, nullif(btrim(p_note), ''))
  returning * into saved;
  return jsonb_build_object('request', to_jsonb(saved), 'clock_out', case when closed.id is null then null else private.clock_result(closed) end);
end $$;

-- "When did you finish?" on the caller's own clock-out: one the job closed, or one later than the approved
-- end. The time must fall between the clock-in and the clock-out as recorded. Carly decides the request.
create function public.request_end_time(
  p_clock_event_id uuid,
  p_reason_code public.correction_reason,
  p_requested_time timestamptz default null,
  p_note text default null
) returns public.correction_requests
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_staff();
  ev public.clock_events;
  clock_in public.clock_events;
  wanted timestamptz;
  saved public.correction_requests;
begin
  select * into ev from public.clock_events e where e.id = p_clock_event_id;
  if not found or ev.user_id <> me then
    raise exception 'You can only ask about your own clock-out' using errcode = '42501';
  end if;
  if ev.kind <> 'out' or private.is_voided(ev.id) then
    raise exception 'That clock-out can''t be changed';
  end if;
  clock_in := private.paired_in(ev.id);
  if clock_in.id is null then
    raise exception 'That clock-out has no clock-in to go with it';
  end if;
  if p_reason_code is null or p_reason_code not in ('forgot_clock_out', 'confirm_auto_close', 'other') then
    raise exception 'Pick what happened';
  end if;
  if p_reason_code = 'confirm_auto_close' and ev.source <> 'auto' then
    raise exception 'Only an automatic clock-out can be confirmed';
  end if;
  if p_reason_code = 'other' and btrim(coalesce(p_note, '')) = '' then
    raise exception 'Say what happened';
  end if;
  if ev.source = 'phone' and private.session_min(clock_in.id, ev.id) <= private.approved_min_for(ev.shift_id) then
    raise exception 'Only a clock-out after your finish time can be changed here';
  end if;

  wanted := case when p_reason_code = 'confirm_auto_close' then private.effective_time(ev.id) else p_requested_time end;
  if wanted is null then
    raise exception 'Pick when you finished';
  end if;
  if wanted <= private.effective_time(clock_in.id) or wanted > ev.server_time then
    raise exception 'Pick a time between your clock-in and your clock-out';
  end if;
  if exists (select 1 from public.correction_requests r where r.clock_event_id = ev.id and r.status = 'pending') then
    raise exception 'Carly already has this to check';
  end if;
  if exists (select 1 from public.correction_requests r where r.clock_event_id = ev.id and r.status = 'declined') then
    raise exception 'Carly has already checked this clock-out';
  end if;

  insert into public.correction_requests (kind, clock_event_id, requested_by, reason_code, note, requested_time)
  values ('end_time', ev.id, me, p_reason_code, nullif(btrim(p_note), ''), wanted)
  returning * into saved;
  return saved;
end $$;

-- ---- Carly's decisions ----

-- Approve or reject, once. A void voids the session; an end time becomes a correction (with the request's
-- reason) when it differs from the time on record. Either way the session's settled flags are resolved.
create function public.decide_correction_request(p_request_id uuid, p_approve boolean) returns public.correction_requests
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_manager('Only the manager can decide corrections');
  r public.correction_requests;
begin
  select * into r from public.correction_requests x where x.id = p_request_id for update;
  if not found then
    raise exception 'That request is no longer there';
  end if;
  if r.status <> 'pending' then
    raise exception 'This request was already decided';
  end if;

  if p_approve and r.kind = 'void' then
    perform private.void_session(r.clock_event_id, private.request_reason_text(r));
  else
    if p_approve then
      if private.effective_time(r.clock_event_id) is distinct from r.requested_time then
        insert into public.corrections (clock_event_id, old_time, new_time, reason, corrected_by)
        values (r.clock_event_id, private.effective_time(r.clock_event_id), r.requested_time, private.request_reason_text(r), me);
      end if;
      perform private.settle_session_flags(r.clock_event_id);
    end if;
    update public.correction_requests x
    set status = (case when p_approve then 'approved' else 'declined' end)::public.request_status, decided_by = me, decided_at = now()
    where x.id = r.id;
  end if;
  select * into r from public.correction_requests x where x.id = p_request_id;
  return r;
end $$;

-- Carly voids a clock-in herself, with a reason (and its clock-out with it). A waiting void request is approved by it.
create function public.void_clock_in(p_clock_event_id uuid, p_reason text) returns public.clock_voids
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_manager('Only the manager can void a clock-in');
  ev public.clock_events;
  saved public.clock_voids;
begin
  select * into ev from public.clock_events e where e.id = p_clock_event_id;
  if not found then
    raise exception 'That clock-in is no longer there';
  end if;
  if ev.kind <> 'in' then
    raise exception 'Only a clock-in can be voided';
  end if;
  if private.is_voided(ev.id) then
    raise exception 'This clock-in was already voided';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A void needs a reason';
  end if;
  perform private.void_session(ev.id, btrim(p_reason));
  select * into saved from public.clock_voids v where v.clock_event_id = ev.id;
  return saved;
end $$;

-- Carly corrects a clock time (PRD F6). The event never changes; the correction becomes its effective time.
create function public.correct_clock_time(p_clock_event_id uuid, p_new_time timestamptz, p_reason text) returns public.corrections
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_manager('Only the manager can correct attendance');
  saved public.corrections;
begin
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A correction needs a reason';
  end if;
  if p_new_time is null then
    raise exception 'Invalid time';
  end if;
  if not exists (select 1 from public.clock_events e where e.id = p_clock_event_id) then
    raise exception 'That clock event is no longer there';
  end if;
  if private.is_voided(p_clock_event_id) then
    raise exception 'A voided clock event can''t be corrected';
  end if;
  insert into public.corrections (clock_event_id, old_time, new_time, reason, corrected_by)
  values (p_clock_event_id, private.effective_time(p_clock_event_id), p_new_time, btrim(p_reason), me)
  returning * into saved;
  return saved;
end $$;

-- ---- Extensions (PRD F5): same rules as src/data/extensions.ts ----

-- The assigned cleaner asks for up to max_extension_request_min more, with a reason (also after clocking out:
-- "Stayed to finish").
create function public.request_extension(p_shift_id uuid, p_minutes integer, p_reason text) returns public.extensions
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s public.site_settings;
  saved public.extensions;
begin
  if not private.is_staff() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into s from public.site_settings;
  if not exists (select 1 from public.shifts sh where sh.id = p_shift_id) then
    raise exception 'That shift is no longer on the roster';
  end if;
  if (select sh.assigned_user_id from public.shifts sh where sh.id = p_shift_id) <> me then
    raise exception 'Only the assigned cleaner can request an extension' using errcode = '42501';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'An extension needs a reason';
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > s.max_extension_request_min then
    raise exception 'Extensions are 1–% minutes', s.max_extension_request_min;
  end if;
  insert into public.extensions (shift_id, requested_by, minutes, reason)
  values (p_shift_id, me, p_minutes, btrim(p_reason))
  returning * into saved;
  return saved;
end $$;

-- Manager only, once. Never beyond max_shift_min in total. Approving settles the flags of a session it now covers.
create function public.decide_extension(p_extension_id uuid, p_approve boolean) returns public.extensions
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s public.site_settings;
  x public.extensions;
  out_id uuid;
begin
  if not private.can_approve_extensions() then
    raise exception 'Only the manager can approve extensions' using errcode = '42501';
  end if;
  select * into s from public.site_settings;
  select * into x from public.extensions e where e.id = p_extension_id for update;
  if not found then
    raise exception 'That request is no longer there';
  end if;
  if x.status <> 'pending' then
    raise exception 'Extension already decided';
  end if;
  if p_approve and s.standard_shift_min + x.minutes
      + coalesce((select sum(e.minutes) from public.extensions e where e.shift_id = x.shift_id and e.status = 'approved' and e.id <> x.id), 0) > s.max_shift_min then
    raise exception 'Approving would take the shift beyond % minutes', s.max_shift_min;
  end if;
  update public.extensions e
  set status = (case when p_approve then 'approved' else 'declined' end)::public.request_status, decided_by = me, decided_at = now()
  where e.id = x.id
  returning * into x;
  if p_approve then
    for out_id in
      select e.id from public.clock_events e where e.shift_id = x.shift_id and e.kind = 'out' and not private.is_voided(e.id)
    loop
      perform private.settle_session_flags(out_id);
    end loop;
  end if;
  return x;
end $$;

-- ---- Voided events no longer count anywhere (replaces parts of 02, 06, 08 and 10) ----

create or replace function private.shift_change() returns trigger
language plpgsql as $$
declare
  clocked boolean := exists (select 1 from public.clock_events e where e.shift_id = old.id and not private.is_voided(e.id));
  actor uuid := auth.uid();
  -- Set (transaction-local) by the swap decision function, so the log links back to the request.
  swap uuid := nullif(current_setting('gymshift.swap_id', true), '')::uuid;
  field text;
  before_value text;
  after_value text;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'A published shift is never deleted. Cancel it instead.';
    end if;
    if clocked then
      raise exception 'Someone has clocked into this shift, so it stays on the roster.';
    end if;
    return old;
  end if;

  if old.status = 'cancelled' then
    raise exception 'This shift was cancelled';
  end if;
  if not (old.status = new.status or (old.status = 'draft' and new.status = 'published') or (old.status = 'published' and new.status = 'cancelled')) then
    raise exception 'A shift can go from draft to published, or from published to cancelled';
  end if;
  if new.id <> old.id or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'Who created a shift, and when, never changes';
  end if;
  if clocked and new.assigned_user_id <> old.assigned_user_id then
    raise exception 'Someone has clocked into this shift, so it can''t be reassigned. Correct the attendance instead.';
  end if;
  if clocked and new.status = 'cancelled' then
    raise exception 'Someone has clocked into this shift, so it stays on the roster.';
  end if;

  new.fortnight_start := private.fortnight_start_of(new.date);

  if old.status = 'published' then
    foreach field in array array['date', 'type', 'start_time', 'end_time', 'assigned_user_id', 'status'] loop
      before_value := to_jsonb(old) ->> field;
      after_value := to_jsonb(new) ->> field;
      if before_value is distinct from after_value then
        if actor is null then
          raise exception 'Changes to a published shift need a signed-in person, so the log says who';
        end if;
        -- Times read "19:00" like TimeString in src/types.
        if field in ('start_time', 'end_time') then
          before_value := left(before_value, 5);
          after_value := left(after_value, 5);
        end if;
        insert into public.shift_changes (shift_id, field, old_value, new_value, changed_by, swap_id)
        values (old.id, field::public.shift_change_field, before_value, after_value, actor, swap);
      end if;
    end loop;
  end if;
  return new;
end $$;

create or replace function public.remove_shift(p_shift_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  old_row public.shifts;
begin
  select * into old_row from public.shifts sh where sh.id = p_shift_id;
  if not found then
    raise exception 'That shift is no longer on the roster';
  end if;
  if old_row.status = 'cancelled' then
    raise exception 'This shift was already cancelled';
  end if;
  perform private.require_rosterer(old_row.assigned_user_id);
  if exists (select 1 from public.clock_events e where e.shift_id = p_shift_id and not private.is_voided(e.id)) then
    raise exception 'Someone has clocked into this shift, so it stays on the roster.';
  end if;

  if old_row.status = 'draft' then
    delete from public.shifts sh where sh.id = p_shift_id;
    return 'deleted';
  end if;
  update public.shifts sh set status = 'cancelled' where sh.id = p_shift_id;
  return 'cancelled';
end $$;

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

  for r in
    select e.id, e.user_id, e.shift_id,
      case when sh.id is null then e.server_time + make_interval(mins => s.standard_shift_min)
        else private.shift_end_at(sh, s.timezone) + make_interval(mins => private.approved_shift_min(sh.id) - s.standard_shift_min)
      end + make_interval(mins => s.missing_out_after_min) as due
    from public.clock_events e
    left join public.shifts sh on sh.id = e.shift_id
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

-- A session still open auto_close_after_min after its approved end is closed AT that end (autoCloseDueAt()
-- and assumedEnd() in src/lib/rules.ts; keep them in step). The end: the shift's end plus approved extra time;
-- unscheduled, or a clock-in after the shift ended, clock-in plus the standard length. The new 'out' event has
-- no location (nobody's phone made it) and is labelled 'auto'. Returns how many it closed.
create function private.close_forgotten_sessions() returns integer
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
    select x.id, x.user_id, x.shift_id,
      case when x.shift_end > x.started then x.shift_end else x.started + make_interval(mins => s.standard_shift_min) end as assumed_end
    from (
      select e.id, e.user_id, e.shift_id, private.effective_time(e.id) as started,
        private.shift_end_at(sh, s.timezone) + make_interval(mins => private.approved_shift_min(sh.id) - s.standard_shift_min) as shift_end
      from public.clock_events e
      left join public.shifts sh on sh.id = e.shift_id
      where e.kind = 'in' and not private.is_voided(e.id)
        and e.server_time > now() - look_back - interval '1 day'
        and private.paired_out(e.id) is null) x
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

-- Photos: the clock-in that counts, and the window from the later of when the session was really closed
-- (or answered, after an automatic close) and its effective end.
create function private.photo_window_from(p_out_id uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select greatest(e.server_time, private.effective_time(e.id), (select max(r.created_at) from public.correction_requests r where r.clock_event_id = e.id))
  from public.clock_events e where e.id = p_out_id
$$;

create or replace function public.add_photo(p_shift_id uuid, p_storage_path text) returns public.photos
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s public.site_settings;
  sh public.shifts;
  last_out uuid;
  size_bytes integer;
  saved public.photos;
begin
  if not private.is_staff() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into s from public.site_settings;
  select * into sh from public.shifts x where x.id = p_shift_id;
  if not found then
    raise exception 'That shift is no longer on the roster';
  end if;
  if sh.assigned_user_id <> me then
    raise exception 'Photos can only be added to your own shift' using errcode = '42501';
  end if;
  -- Counted one upload at a time per shift, so two at once can't both take the last place.
  perform pg_advisory_xact_lock(hashtext('photos:' || p_shift_id::text));

  if not exists (select 1 from public.clock_events e where e.shift_id = p_shift_id and e.kind = 'in' and not private.is_voided(e.id)) then
    raise exception 'Photos can be added once you clock in';
  end if;
  select e.id into last_out from public.clock_events e
  where e.shift_id = p_shift_id and e.kind = 'out' and not private.is_voided(e.id)
  order by e.server_time desc limit 1;
  if last_out is not null and now() > private.photo_window_from(last_out) + make_interval(mins => s.photo_upload_window_min) then
    raise exception 'Photos for this shift have closed';
  end if;
  if (select count(*) from public.photos p where p.shift_id = p_shift_id and p.removed_at is null) >= s.max_photos_per_shift then
    raise exception 'A shift can have at most % photos', s.max_photos_per_shift;
  end if;

  if split_part(p_storage_path, '/', 2) <> p_shift_id::text or not private.is_own_photo_path(p_storage_path) then
    raise exception 'That photo isn''t in this shift''s folder';
  end if;
  -- The size Storage recorded, not what the phone says.
  select (o.metadata ->> 'size')::integer into size_bytes
  from storage.objects o where o.bucket_id = 'shift-photos' and o.name = p_storage_path;
  if size_bytes is null or size_bytes <= 0 then
    raise exception 'The photo didn''t upload. Try again.';
  end if;

  begin
    insert into public.photos (shift_id, user_id, storage_path, size_bytes, expires_at)
    values (p_shift_id, me, p_storage_path, size_bytes, now() + make_interval(months => s.photo_retention_months))
    returning * into saved;
  exception when unique_violation then
    raise exception 'That photo is already saved';
  end;
  return saved;
end $$;

-- ---- Privileges ----

-- Helpers stay callable only from inside the functions above (they run as the owner).
revoke all on function private.is_voided(uuid) from public, anon, authenticated;
revoke all on function private.open_clock_in(uuid) from public, anon, authenticated;
revoke all on function private.paired_out(uuid) from public, anon, authenticated;
revoke all on function private.paired_in(uuid) from public, anon, authenticated;
revoke all on function private.session_min(uuid, uuid) from public, anon, authenticated;
revoke all on function private.approved_min_for(uuid) from public, anon, authenticated;
revoke all on function private.request_reason_text(public.correction_requests) from public, anon, authenticated;
revoke all on function private.void_session(uuid, text) from public, anon, authenticated;
revoke all on function private.settle_session_flags(uuid) from public, anon, authenticated;
revoke all on function private.require_manager(text) from public, anon, authenticated;
revoke all on function private.close_forgotten_sessions() from public, anon, authenticated;
revoke all on function private.photo_window_from(uuid) from public, anon, authenticated;

revoke all on function public.request_void(uuid, public.correction_reason, text, public.location_status, double precision, double precision, double precision) from public, anon;
revoke all on function public.request_end_time(uuid, public.correction_reason, timestamptz, text) from public, anon;
revoke all on function public.decide_correction_request(uuid, boolean) from public, anon;
revoke all on function public.void_clock_in(uuid, text) from public, anon;
revoke all on function public.correct_clock_time(uuid, timestamptz, text) from public, anon;
revoke all on function public.request_extension(uuid, integer, text) from public, anon;
revoke all on function public.decide_extension(uuid, boolean) from public, anon;
grant execute on function public.request_void(uuid, public.correction_reason, text, public.location_status, double precision, double precision, double precision) to authenticated;
grant execute on function public.request_end_time(uuid, public.correction_reason, timestamptz, text) to authenticated;
grant execute on function public.decide_correction_request(uuid, boolean) to authenticated;
grant execute on function public.void_clock_in(uuid, text) to authenticated;
grant execute on function public.correct_clock_time(uuid, timestamptz, text) to authenticated;
grant execute on function public.request_extension(uuid, integer, text) to authenticated;
grant execute on function public.decide_extension(uuid, boolean) to authenticated;

-- The scheduled job (08_due_flags) now closes forgotten sessions after raising flags.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('gymshift-due-flags', '*/5 * * * *', 'select private.raise_due_flags(); select private.close_forgotten_sessions();');
  end if;
end $$;
