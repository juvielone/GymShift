-- Notes for the shift (PRD F8, decided 5 Nov 2026): Carly, or a team lead for their own group, leaves a note
-- on a shift ("Please do the dusting") that whoever works it sees on their home before they start, and taps
-- "Got it". Same checks and wording as src/data/shiftInstructions.ts.
--
-- A note belongs to the shift, not the person: if the shift is swapped, the new person sees it. Nothing is
-- edited or deleted. Whoever wrote it (or Carly) can take it back once (withdrawn_*); "Got it" is one
-- append-only row per person.

create table public.shift_instructions (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id),
  author_id uuid not null references public.users (id),
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_by uuid references public.users (id),
  check ((withdrawn_at is null) = (withdrawn_by is null))
);
create index shift_instructions_shift_idx on public.shift_instructions (shift_id);

create table public.shift_instruction_reads (
  instruction_id uuid not null references public.shift_instructions (id),
  user_id uuid not null references public.users (id),
  seen_at timestamptz not null default now(),
  primary key (instruction_id, user_id)
);

create trigger shift_instructions_never_deleted before delete on public.shift_instructions
  for each row execute function private.forbid();
create trigger shift_instructions_withdraw_once before update on public.shift_instructions
  for each row execute function private.set_once('withdrawn_at', 'withdrawn_by');
create trigger shift_instruction_reads_append_only before update or delete on public.shift_instruction_reads
  for each row execute function private.forbid();
create trigger shift_instruction_reads_no_truncate before truncate on public.shift_instruction_reads
  execute function private.forbid();

-- ---- Who reads them ----
-- The person on the shift, their team lead and Carly (as for records), and whoever wrote it. A draft shift's
-- notes stay with the people who roster, like the draft itself (the shifts policy hides drafts from staff).

grant select on public.shift_instructions, public.shift_instruction_reads to authenticated;
alter table public.shift_instructions enable row level security;
alter table public.shift_instruction_reads enable row level security;

create policy shift_instructions_read on public.shift_instructions for select to authenticated
  using (exists (
    select 1 from public.shifts s
    where s.id = shift_id and (author_id = auth.uid() or private.can_view_records_of(s.assigned_user_id))
  ));

create policy shift_instruction_reads_read on public.shift_instruction_reads for select to authenticated
  using (
    private.can_view_records_of(user_id)
    or exists (select 1 from public.shift_instructions i where i.id = instruction_id and i.author_id = auth.uid())
  );

-- ---- Who writes them ----

-- The manager on anyone's shift, a team lead on their own group's; never on your own shift.
create function private.can_instruct(sh public.shifts) returns boolean
language sql stable security definer set search_path = '' as $$
  select sh.assigned_user_id is distinct from auth.uid()
    and coalesce((select r.view_records_scope <> 'own' from private.my_role() r where r.id is not null), false)
    and coalesce(private.can_view_records_of(sh.assigned_user_id), false)
$$;

create function public.add_shift_instruction(p_shift_id uuid, p_body text) returns public.shift_instructions
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  sh public.shifts;
  tz text;
  saved public.shift_instructions;
begin
  if not private.is_staff() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into sh from public.shifts s where s.id = p_shift_id;
  if not found then
    raise exception 'That shift is no longer on the roster';
  end if;
  if sh.assigned_user_id = me then
    raise exception 'This is your own shift' using errcode = '42501';
  end if;
  if not private.can_instruct(sh) then
    raise exception 'Only Carly or their team lead can leave a note for this shift' using errcode = '42501';
  end if;
  if sh.status = 'cancelled' then
    raise exception 'This shift is cancelled';
  end if;
  select s.timezone into tz from public.site_settings s limit 1;
  if private.shift_end_at(sh, tz) <= now() then
    raise exception 'This shift has already finished';
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'A note needs some text';
  end if;

  insert into public.shift_instructions (shift_id, author_id, body)
  values (sh.id, me, btrim(p_body))
  returning * into saved;
  return saved;
end $$;

-- "Got it": only the person now on the shift. Tapping it again keeps the first time.
create function public.mark_shift_instruction_seen(p_instruction_id uuid) returns public.shift_instruction_reads
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ins public.shift_instructions;
  saved public.shift_instruction_reads;
begin
  if not private.is_staff() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into ins from public.shift_instructions i where i.id = p_instruction_id;
  if not found then
    raise exception 'That note is no longer there';
  end if;
  if not exists (select 1 from public.shifts s where s.id = ins.shift_id and s.assigned_user_id = me and s.status = 'published') then
    raise exception 'This note is for someone else' using errcode = '42501';
  end if;
  insert into public.shift_instruction_reads (instruction_id, user_id) values (ins.id, me)
  on conflict do nothing;
  select * into saved from public.shift_instruction_reads r where r.instruction_id = ins.id and r.user_id = me;
  return saved;
end $$;

-- Take a note back: whoever wrote it, or the manager. It stays on record; the person on the shift stops seeing it.
create function public.withdraw_shift_instruction(p_instruction_id uuid) returns public.shift_instructions
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ins public.shift_instructions;
begin
  if not private.is_staff() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into ins from public.shift_instructions i where i.id = p_instruction_id;
  if not found then
    raise exception 'That note is no longer there';
  end if;
  if ins.author_id <> me and coalesce((select r.view_records_scope::text from private.my_role() r where r.id is not null), 'own') <> 'all' then
    raise exception 'Only whoever wrote it, or Carly, can take this note back' using errcode = '42501';
  end if;
  update public.shift_instructions i set withdrawn_at = now(), withdrawn_by = me
  where i.id = ins.id and i.withdrawn_at is null;
  select * into ins from public.shift_instructions i where i.id = p_instruction_id;
  return ins;
end $$;

revoke all on function private.can_instruct(public.shifts) from public, anon;
grant execute on function private.can_instruct(public.shifts) to authenticated;
revoke all on function public.add_shift_instruction(uuid, text) from public, anon;
revoke all on function public.mark_shift_instruction_seen(uuid) from public, anon;
revoke all on function public.withdraw_shift_instruction(uuid) from public, anon;
grant execute on function public.add_shift_instruction(uuid, text) to authenticated;
grant execute on function public.mark_shift_instruction_seen(uuid) to authenticated;
grant execute on function public.withdraw_shift_instruction(uuid) to authenticated;
