-- Swaps, covers and days off (PRD F3). Same checks and wording as src/data/swaps.ts and availability.ts.
--
-- A cleaner who can't make a shift asks a named colleague ('swap') or anyone who's free ('cover'). Someone
-- says yes first (covered_by + accepted_at: who takes it); then Carly or Gladys approves and the shift
-- moves to them, logged in shift_changes with the request's id. Nobody decides a request they are part of:
-- those go to Carly. The person asked can say no, and the person who asked can withdraw it. Each request
-- is decided once (approved, declined or withdrawn) and never deleted. Nothing is approved once the shift
-- has started; the shift then stays with whoever is on it.

-- ---- Who takes the shift: set when they say yes (or by the approver for a cover nobody offered on) ----

alter table public.swaps add column accepted_at timestamptz;

-- 01_schema allowed covered_by on covers only; now it is the person taking the shift for either kind.
do $$
declare
  c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.swaps'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%covered_by IS NULL%';
  if c is not null then
    execute format('alter table public.swaps drop constraint %I', c);
  end if;
end $$;

alter table public.swaps add constraint swaps_taker check (
  (accepted_at is null or covered_by is not null)
  and (kind = 'cover' or covered_by is null or covered_by = target_user_id)
  and covered_by is distinct from requested_by
);

-- Replaces decide_once for swaps: while pending, only the yes (covered_by, accepted_at) may be added,
-- once; then one decision, which may also name who covers an open cover. Nothing else ever changes.
create function private.swap_once() returns trigger
language plpgsql as $$
declare
  answer text[] := array['covered_by', 'accepted_at'];
  decision text[] := array['status', 'decided_by', 'decided_at', 'covered_by'];
begin
  if old.status <> 'pending' then
    raise exception 'This request was already decided';
  end if;
  if new.status = 'pending' then
    if old.accepted_at is not null or new.accepted_at is null or new.covered_by is null or (to_jsonb(new) - answer) <> (to_jsonb(old) - answer) then
      raise exception 'Someone already said yes to this shift';
    end if;
    return new;
  end if;
  if new.covered_by is distinct from old.covered_by and (old.covered_by is not null or new.status <> 'approved') then
    raise exception 'Only the decision can change on a request';
  end if;
  if (to_jsonb(new) - decision) <> (to_jsonb(old) - decision) then
    raise exception 'Only the decision can change on a request';
  end if;
  return new;
end $$;

drop trigger swaps_decide_once on public.swaps;
create trigger swaps_once before update on public.swaps for each row execute function private.swap_once();

-- ---- Helpers ----

-- Whether a person has no other shift overlapping this one (published or draft; cancelled ones don't count).
create function private.is_free_for(p_user_id uuid, p_shift public.shifts) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.shifts o, public.site_settings s
    where o.assigned_user_id = p_user_id and o.id <> p_shift.id and o.status <> 'cancelled'
      and private.shift_start_at(o, s.timezone) < private.shift_end_at(p_shift, s.timezone)
      and private.shift_end_at(o, s.timezone) > private.shift_start_at(p_shift, s.timezone)
  )
$$;

-- The request's shift, locked, still as it was asked about: published, not started, still the asker's.
create function private.swap_shift(p_swap public.swaps) returns public.shifts
language plpgsql security definer set search_path = '' as $$
declare
  sh public.shifts;
begin
  select * into sh from public.shifts x where x.id = p_swap.shift_id for update;
  if not found or sh.status <> 'published' or sh.assigned_user_id <> p_swap.requested_by then
    raise exception 'This shift changed, so this request no longer applies';
  end if;
  if private.shift_start_at(sh, (select s.timezone from public.site_settings s)) <= now() then
    raise exception 'This shift has started, so it stays with %', (select u.full_name from public.users u where u.id = sh.assigned_user_id);
  end if;
  return sh;
end $$;

create function private.pending_swap(p_swap_id uuid) returns public.swaps
language plpgsql security definer set search_path = '' as $$
declare
  x public.swaps;
begin
  select * into x from public.swaps w where w.id = p_swap_id for update;
  if not found then
    raise exception 'That request is no longer there';
  end if;
  if x.status = 'withdrawn' then
    raise exception 'This request was withdrawn';
  end if;
  if x.status <> 'pending' then
    raise exception 'This request was already decided';
  end if;
  return x;
end $$;

-- ---- The person on the shift asks ----

-- p_target_user_id null: anyone who's free (a cover). Otherwise that colleague (a swap), who must be free then.
create function public.request_swap(p_shift_id uuid, p_target_user_id uuid default null, p_reason text default null) returns public.swaps
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  sh public.shifts;
  saved public.swaps;
begin
  if not private.is_staff() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into sh from public.shifts x where x.id = p_shift_id for update;
  if not found or sh.status = 'cancelled' then
    raise exception 'That shift is no longer on the roster';
  end if;
  if sh.assigned_user_id <> me then
    raise exception 'Only the person on this shift can ask' using errcode = '42501';
  end if;
  if sh.status <> 'published' then
    raise exception 'Only a published shift can be handed over';
  end if;
  if private.shift_start_at(sh, (select s.timezone from public.site_settings s)) <= now() then
    raise exception 'This shift has started, so it can''t be handed over now';
  end if;
  if exists (select 1 from public.swaps w where w.shift_id = sh.id and w.status = 'pending') then
    raise exception 'You already asked about this shift. Withdraw that first.';
  end if;
  if p_target_user_id is not null then
    if p_target_user_id = me then
      raise exception 'Pick someone else';
    end if;
    if not exists (select 1 from public.users u where u.id = p_target_user_id and u.active) then
      raise exception 'That person is no longer active';
    end if;
    if not private.is_free_for(p_target_user_id, sh) then
      raise exception '% is working then', (select u.full_name from public.users u where u.id = p_target_user_id);
    end if;
  end if;

  begin
    insert into public.swaps (shift_id, kind, requested_by, target_user_id, reason)
    values (sh.id, (case when p_target_user_id is null then 'cover' else 'swap' end)::public.swap_kind, me, p_target_user_id,
      nullif(btrim(coalesce(p_reason, '')), ''))
    returning * into saved;
  exception when unique_violation then
    raise exception 'You already asked about this shift. Withdraw that first.';
  end;
  return saved;
end $$;

-- The colleague asked (a swap), or anyone free (a cover), says yes; the person asked can also say no.
create function public.answer_swap(p_swap_id uuid, p_yes boolean) returns public.swaps
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  x public.swaps;
  sh public.shifts;
begin
  if not private.is_staff() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  x := private.pending_swap(p_swap_id);
  if x.requested_by = me then
    raise exception 'This is your own request';
  end if;
  if x.kind = 'swap' and x.target_user_id <> me then
    raise exception 'This request is for someone else' using errcode = '42501';
  end if;
  if x.accepted_at is not null then
    raise exception 'Someone already said yes to this shift';
  end if;
  if not coalesce(p_yes, false) then
    if x.kind = 'cover' then
      raise exception 'Only the person asked can say no';
    end if;
    update public.swaps w set status = 'declined', decided_by = me, decided_at = now() where w.id = x.id returning * into x;
    return x;
  end if;
  sh := private.swap_shift(x);
  if not private.is_free_for(me, sh) then
    raise exception 'You''re working then, so you can''t take this shift';
  end if;
  update public.swaps w set covered_by = me, accepted_at = now() where w.id = x.id returning * into x;
  return x;
end $$;

create function public.withdraw_swap(p_swap_id uuid) returns public.swaps
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  x public.swaps;
begin
  if not private.is_staff() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  x := private.pending_swap(p_swap_id);
  if x.requested_by <> me then
    raise exception 'Only the person who asked can withdraw it' using errcode = '42501';
  end if;
  update public.swaps w set status = 'withdrawn', decided_by = me, decided_at = now() where w.id = x.id returning * into x;
  return x;
end $$;

-- Carly or Gladys, once. A swap needs the colleague's yes first; a cover takes whoever offered, or the
-- person the approver picks when nobody has. Approving moves the shift and logs it with the request.
create function public.decide_swap(p_swap_id uuid, p_approve boolean, p_covered_by uuid default null) returns public.swaps
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  x public.swaps;
  sh public.shifts;
  taker uuid;
begin
  if not private.can_approve_swaps() then
    raise exception 'Not allowed to decide this swap' using errcode = '42501';
  end if;
  x := private.pending_swap(p_swap_id);
  taker := coalesce(x.covered_by, case when x.kind = 'cover' then p_covered_by end);
  if me = x.requested_by or me = taker then
    raise exception 'You''re part of this request, so Carly decides it' using errcode = '42501';
  end if;
  if not coalesce(p_approve, false) then
    update public.swaps w set status = 'declined', decided_by = me, decided_at = now() where w.id = x.id returning * into x;
    return x;
  end if;
  if x.kind = 'swap' and x.covered_by is null then
    raise exception '% hasn''t said yes yet', (select u.full_name from public.users u where u.id = x.target_user_id);
  end if;
  if taker is null then
    raise exception 'A cover needs someone to cover it';
  end if;
  sh := private.swap_shift(x);
  if not exists (select 1 from public.users u where u.id = taker and u.active) then
    raise exception 'That person is no longer active';
  end if;
  if not private.is_free_for(taker, sh) then
    raise exception '% is working then', (select u.full_name from public.users u where u.id = taker);
  end if;

  perform set_config('gymshift.swap_id', x.id::text, true);
  update public.shifts s set assigned_user_id = taker where s.id = sh.id;
  perform set_config('gymshift.swap_id', '', true);
  update public.swaps w set status = 'approved', decided_by = me, decided_at = now(), covered_by = taker where w.id = x.id returning * into x;
  return x;
end $$;

-- ---- Days off ----

-- Sets the signed-in person's days off between p_from and p_to to exactly p_dates (from tomorrow on), with
-- one optional note. Past days and today stay as they are. Returns that person's days off in the range.
create function public.set_days_off(p_from date, p_to date, p_dates date[], p_note text default null) returns setof public.availability
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone (select s.timezone from public.site_settings s))::date;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not private.is_staff() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 31 then
    raise exception 'Pick days within one month';
  end if;
  if exists (select 1 from unnest(coalesce(p_dates, '{}')) d where d < p_from or d > p_to or d <= today) then
    raise exception 'Pick days from tomorrow on';
  end if;
  delete from public.availability a
  where a.user_id = me and a.date between greatest(p_from, today + 1) and p_to and not (a.date = any(coalesce(p_dates, '{}')));
  insert into public.availability (user_id, date, note)
  select me, d, note from unnest(coalesce(p_dates, '{}')) d
  on conflict (user_id, date) do update set note = excluded.note;
  return query select * from public.availability a where a.user_id = me and a.date between p_from and p_to order by a.date;
end $$;

-- ---- Who sees a request: the people in it and the approvers, and an open cover is shown to all staff ----

drop policy swaps_read on public.swaps;
create policy swaps_read on public.swaps for select to authenticated
  using (private.is_staff() and (
    auth.uid() in (requested_by, target_user_id, covered_by)
    or private.can_approve_swaps()
    or (kind = 'cover' and status = 'pending')
  ));

-- ---- Privileges ----

revoke all on function private.is_free_for(uuid, public.shifts) from public, anon, authenticated;
revoke all on function private.swap_shift(public.swaps) from public, anon, authenticated;
revoke all on function private.pending_swap(uuid) from public, anon, authenticated;

revoke all on function public.request_swap(uuid, uuid, text) from public, anon;
revoke all on function public.answer_swap(uuid, boolean) from public, anon;
revoke all on function public.withdraw_swap(uuid) from public, anon;
revoke all on function public.decide_swap(uuid, boolean, uuid) from public, anon;
revoke all on function public.set_days_off(date, date, date[], text) from public, anon;
grant execute on function public.request_swap(uuid, uuid, text) to authenticated;
grant execute on function public.answer_swap(uuid, boolean) to authenticated;
grant execute on function public.withdraw_swap(uuid) to authenticated;
grant execute on function public.decide_swap(uuid, boolean, uuid) to authenticated;
grant execute on function public.set_days_off(date, date, date[], text) to authenticated;
