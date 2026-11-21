-- Extra time decided per shift (21 Nov 2026). Carly answers once for a shift's waiting extra-time requests,
-- on the time actually worked: Approve (the time worked), Correct time (a fair finish, approved in the same
-- step) or Not approved (hours stay as recorded). Same rules as decideExtraTime() in src/data/extensions.ts.
--
-- - extensions.approved_min: what was approved, which can differ from what was asked (the time worked; 0 when
--   earlier approvals already cover it). null = as asked (approvals before this migration).
-- - The 3.5h maximum warns instead of blocking: approved_shift_min() is no longer capped at max_shift_min.
--   The app warns before an approval goes past it. decide_extension() (one request, as asked) keeps its cap.
-- - Requests are still decided once; clock events are never changed (a corrected finish is a corrections row).
-- Every UPDATE has a WHERE (pg_safeupdate).

alter table public.extensions
  add column approved_min integer,
  add constraint extensions_approved_min_when_approved check (approved_min is null or (status = 'approved' and approved_min >= 0));

-- The decision now includes approved_min (replaces 02_guards). Everything else on a request stays as asked.
create or replace function private.decide_once() returns trigger
language plpgsql as $$
declare
  decision text[] := array['status', 'decided_by', 'decided_at', 'covered_by', 'approved_min'];
begin
  if old.status <> 'pending' then
    raise exception 'This request was already decided';
  end if;
  if new.status = 'pending' then
    raise exception 'A pending request can only be approved or declined';
  end if;
  if (to_jsonb(new) - decision) <> (to_jsonb(old) - decision) then
    raise exception 'Only the decision can change on a request';
  end if;
  return new;
end $$;

-- Standard length plus approved extra time (what was approved, else what was asked). Not capped: Carly may
-- approve past max_shift_min after a warning (approvedShiftMinutes() in src/lib/rules.ts).
create or replace function private.approved_shift_min(p_shift_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select (s.standard_shift_min + coalesce((
    select sum(coalesce(x.approved_min, x.minutes)) from public.extensions x where x.shift_id = p_shift_id and x.status = 'approved'), 0))::integer
  from public.site_settings s
$$;

-- Carly's one answer on a shift's extra time, for every request still waiting on it. The oldest waiting request
-- carries the approved minutes, the rest approve 0 (already counted). Returns the requests it decided.
create function public.decide_extra_time(p_shift_id uuid, p_approve boolean, p_finish_at timestamptz default null, p_reason text default null)
returns setof public.extensions
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ids uuid[];
  clock_in public.clock_events;
  out_id uuid;
  approved_before integer;
  extra integer;
begin
  if not private.can_approve_extensions() then
    raise exception 'Only the manager can approve extra time' using errcode = '42501';
  end if;
  if p_approve is null then
    raise exception 'Approve or not approved';
  end if;
  if not exists (select 1 from public.shifts sh where sh.id = p_shift_id) then
    raise exception 'That shift is no longer on the roster';
  end if;
  select array_agg(x.id order by x.created_at, x.id) into ids
  from (select e.id, e.created_at from public.extensions e where e.shift_id = p_shift_id and e.status = 'pending' for update) x;
  if ids is null then
    raise exception 'Extension already decided';
  end if;

  -- The session holding the shift: its first counting clock-in not waiting on "This was a mistake" (shiftSession()).
  select e.* into clock_in from public.clock_events e
  where e.shift_id = p_shift_id and e.kind = 'in' and not private.is_voided(e.id)
  order by exists (select 1 from public.correction_requests r where r.clock_event_id = e.id and r.kind = 'void' and r.status = 'pending'), e.server_time
  limit 1;
  out_id := case when clock_in.id is null then null else private.paired_out(clock_in.id) end;

  -- "Correct time": the fair finish is a correction on the clock-out, then approved up to it.
  if p_finish_at is not null then
    if not p_approve then
      raise exception 'A corrected finish is approved, not declined';
    end if;
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception 'A correction needs a reason';
    end if;
    if out_id is null then
      raise exception 'There''s no clock-out to correct yet';
    end if;
    if p_finish_at <= private.effective_time(clock_in.id) then
      raise exception 'Pick a finish after the clock-in';
    end if;
    insert into public.corrections (clock_event_id, old_time, new_time, reason, corrected_by)
    values (out_id, private.effective_time(out_id), p_finish_at, btrim(p_reason), me);
  end if;

  approved_before := private.approved_shift_min(p_shift_id);
  if out_id is not null then
    extra := private.session_min(clock_in.id, out_id) - approved_before;
    if not private.is_over_length(private.session_min(clock_in.id, out_id), approved_before) then
      extra := 0;
    end if;
  end if;

  update public.extensions e
  set status = (case when p_approve then 'approved' else 'declined' end)::public.request_status,
      decided_by = me,
      decided_at = now(),
      approved_min = case when not p_approve then null when out_id is null then e.minutes when e.id = ids[1] then extra else 0 end
  where e.id = any (ids);

  if out_id is not null then
    if p_approve then
      perform private.settle_session_flags(out_id);
    else
      -- Not approved: one decision closes the session's extra-time flags. Hours stay as recorded.
      update public.flags f
      set resolved_at = now(), resolved_by = me, resolved_note = 'Extra time not approved. Hours stay as recorded.'
      where f.shift_id = p_shift_id and f.user_id = clock_in.user_id and f.resolved_at is null
        and f.kind in ('over_without_extension', 'missing_clock_out');
    end if;
  end if;

  return query select e.* from public.extensions e where e.id = any (ids) order by e.created_at, e.id;
end $$;

revoke all on function public.decide_extra_time(uuid, boolean, timestamptz, text) from public, anon;
grant execute on function public.decide_extra_time(uuid, boolean, timestamptz, text) to authenticated;
