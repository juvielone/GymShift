-- Carly resolves a flag (PRD F6). Same check and wording as resolveFlag() in src/data/flags.ts.
-- Resolving records who and when, once (the flags_resolve_once trigger in 02_guards keeps the rest of
-- the row as raised); the flagged clock event or shift is untouched.

-- Manager only. Resolving a flag that is already resolved leaves it as it was.
create function public.resolve_flag(p_flag_id uuid) returns public.flags
language plpgsql security definer set search_path = '' as $$
declare
  saved public.flags;
begin
  if not coalesce((select r.can_correct_attendance from private.my_role() r where r.id is not null), false) then
    raise exception 'Only the manager can resolve flags' using errcode = '42501';
  end if;
  update public.flags f set resolved_at = now(), resolved_by = auth.uid()
  where f.id = p_flag_id and f.resolved_at is null;
  select * into saved from public.flags f where f.id = p_flag_id;
  if not found then
    raise exception 'That flag is no longer there';
  end if;
  return saved;
end $$;

revoke all on function public.resolve_flag(uuid) from public, anon;
grant execute on function public.resolve_flag(uuid) to authenticated;
