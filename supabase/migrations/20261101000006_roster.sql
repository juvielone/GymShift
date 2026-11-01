-- Building the roster (PRD F2): add, edit and remove shifts, copy last fortnight, publish.
-- Same checks and wording as src/data/shifts.ts. The record-keeping rules stay in the shifts triggers
-- (02_guards): the fortnight, the change log for published shifts, cancel-never-delete, and a shift
-- someone clocked into keeping its owner. These functions add who may roster and friendlier messages.

-- Whether the signed-in person may roster a shift worked by target (the role's can_publish_roster scope).
create function private.can_roster_for(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case r.can_publish_roster
      when 'all' then true
      when 'own_group' then target = auth.uid() or exists (select 1 from public.users t where t.id = target and t.team_lead_id = auth.uid())
      else false
    end
    from private.my_role() r
    where r.id is not null), false)
$$;

create function private.require_rosterer(target uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_roster_for(target) then
    raise exception 'Not allowed to roster this shift' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- Adds a draft; it goes live on the next publish. Times default from site settings. One active shift per slot.
create function public.create_shift(
  p_date date,
  p_type public.shift_type,
  p_assigned_user_id uuid,
  p_start_time time default null,
  p_end_time time default null
) returns public.shifts
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_rosterer(p_assigned_user_id);
  s public.site_settings;
  start_at time;
  end_at time;
  saved public.shifts;
begin
  select * into s from public.site_settings;
  if not exists (select 1 from public.users u where u.id = p_assigned_user_id and u.active) then
    raise exception 'That person is no longer active';
  end if;
  if exists (select 1 from public.shifts sh where sh.date = p_date and sh.type = p_type and sh.status <> 'cancelled') then
    raise exception 'That shift is already on the roster';
  end if;
  start_at := coalesce(p_start_time, case p_type when 'morning' then s.default_morning_start else s.default_night_start end);
  -- time + interval wraps past midnight, like defaultEndTime() in src/lib/rules.ts.
  end_at := coalesce(p_end_time, start_at + make_interval(mins => s.standard_shift_min));
  if end_at = start_at then
    raise exception 'A shift can''t start and end at the same time';
  end if;

  begin
    insert into public.shifts (date, type, start_time, end_time, assigned_user_id, fortnight_start, created_by)
    values (p_date, p_type, start_at, end_at, p_assigned_user_id, private.fortnight_start_of(p_date), me)
    returning * into saved;
  exception when unique_violation then
    raise exception 'That shift is already on the roster';
  end;
  return saved;
end $$;

-- Edits a shift; a null argument leaves that field as it is. Changes to a published shift are logged by the trigger.
create function public.update_shift(
  p_shift_id uuid,
  p_date date default null,
  p_type public.shift_type default null,
  p_start_time time default null,
  p_end_time time default null,
  p_assigned_user_id uuid default null
) returns public.shifts
language plpgsql security definer set search_path = '' as $$
declare
  old_row public.shifts;
  saved public.shifts;
begin
  select * into old_row from public.shifts sh where sh.id = p_shift_id;
  if not found then
    raise exception 'That shift is no longer on the roster';
  end if;
  if old_row.status = 'cancelled' then
    raise exception 'This shift was cancelled';
  end if;
  perform private.require_rosterer(old_row.assigned_user_id);
  if p_assigned_user_id is not null then
    perform private.require_rosterer(p_assigned_user_id);
  end if;
  if coalesce(p_start_time, old_row.start_time) = coalesce(p_end_time, old_row.end_time) then
    raise exception 'A shift can''t start and end at the same time';
  end if;

  begin
    update public.shifts sh set
      date = coalesce(p_date, sh.date),
      type = coalesce(p_type, sh.type),
      start_time = coalesce(p_start_time, sh.start_time),
      end_time = coalesce(p_end_time, sh.end_time),
      assigned_user_id = coalesce(p_assigned_user_id, sh.assigned_user_id)
    where sh.id = p_shift_id
    returning * into saved;
  exception when unique_violation then
    raise exception 'That shift is already on the roster';
  end;
  return saved;
end $$;

-- A draft nobody has seen is deleted; a published shift is cancelled (and logged). Returns which.
create function public.remove_shift(p_shift_id uuid) returns text
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
  if exists (select 1 from public.clock_events e where e.shift_id = p_shift_id) then
    raise exception 'Someone has clocked into this shift, so it stays on the roster.';
  end if;

  if old_row.status = 'draft' then
    delete from public.shifts sh where sh.id = p_shift_id;
    return 'deleted';
  end if;
  update public.shifts sh set status = 'cancelled' where sh.id = p_shift_id;
  return 'cancelled';
end $$;

-- Fills a fortnight with drafts copied from another: same day, type, times and cleaner. Filled slots
-- and people no longer active are skipped. All or nothing: if one copy isn't allowed, none are made.
create function public.copy_fortnight(p_from_start date, p_to_start date) returns setof public.shifts
language plpgsql security definer set search_path = '' as $$
declare
  src public.shifts;
  offset_days integer := p_to_start - p_from_start;
begin
  if p_from_start is distinct from private.fortnight_start_of(p_from_start) or p_to_start is distinct from private.fortnight_start_of(p_to_start) then
    raise exception 'Pick the Monday a fortnight starts on';
  end if;
  for src in
    select * from public.shifts sh
    where sh.fortnight_start = p_from_start and sh.status <> 'cancelled'
    order by sh.date, sh.start_time
  loop
    continue when not exists (select 1 from public.users u where u.id = src.assigned_user_id and u.active);
    continue when exists (select 1 from public.shifts sh where sh.date = src.date + offset_days and sh.type = src.type and sh.status <> 'cancelled');
    return next public.create_shift(src.date + offset_days, src.type, src.assigned_user_id, src.start_time, src.end_time);
  end loop;
end $$;

-- Publishes every draft in a fortnight that the caller may roster, all with the same time.
create function public.publish_fortnight(p_fortnight_start date) returns setof public.shifts
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_roster() then
    raise exception 'Not allowed to roster this shift' using errcode = '42501';
  end if;
  return query
    update public.shifts sh set status = 'published', published_at = now()
    where sh.fortnight_start = p_fortnight_start and sh.status = 'draft' and private.can_roster_for(sh.assigned_user_id)
    returning sh.*;
end $$;

revoke all on function private.can_roster_for(uuid) from public, anon, authenticated;
revoke all on function private.require_rosterer(uuid) from public, anon, authenticated;

revoke all on function public.create_shift(date, public.shift_type, uuid, time, time) from public, anon;
revoke all on function public.update_shift(uuid, date, public.shift_type, time, time, uuid) from public, anon;
revoke all on function public.remove_shift(uuid) from public, anon;
revoke all on function public.copy_fortnight(date, date) from public, anon;
revoke all on function public.publish_fortnight(date) from public, anon;
grant execute on function public.create_shift(date, public.shift_type, uuid, time, time) to authenticated;
grant execute on function public.update_shift(uuid, date, public.shift_type, time, time, uuid) to authenticated;
grant execute on function public.remove_shift(uuid) to authenticated;
grant execute on function public.copy_fortnight(date, date) to authenticated;
grant execute on function public.publish_fortnight(date) to authenticated;
