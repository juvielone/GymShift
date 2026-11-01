-- Shift notes for Carly (PRD F8): Supplies low, Something wrong, general notes, and Running late before
-- clock-in. Same checks and wording as src/data/notes.ts. Notes are never edited or deleted; Carly marks
-- one done, once (the notes_done_once trigger in 02_guards keeps the rest of the row as written).

-- On the author's own shift (the manager may note any shift). A 'running_late' note says when they expect to arrive.
create function public.add_note(
  p_shift_id uuid,
  p_body text,
  p_tag public.note_tag default null,
  p_arrive_by timestamptz default null
) returns public.notes
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  sh public.shifts;
  saved public.notes;
begin
  if not private.is_staff() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into sh from public.shifts s where s.id = p_shift_id;
  if not found then
    raise exception 'That shift is no longer on the roster';
  end if;
  if sh.assigned_user_id <> me and (select r.view_records_scope from private.my_role() r) <> 'all' then
    raise exception 'Notes can only be added to your own shift' using errcode = '42501';
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'A note needs some text';
  end if;
  if p_tag = 'running_late' and p_arrive_by is null then
    raise exception 'Say about when you will arrive';
  end if;

  insert into public.notes (shift_id, user_id, body, tag, arrive_by)
  values (p_shift_id, me, btrim(p_body), p_tag, case when p_tag = 'running_late' then p_arrive_by end)
  returning * into saved;
  return saved;
end $$;

-- Manager only. Marking a note that is already done leaves it as it was.
create function public.mark_note_done(p_note_id uuid) returns public.notes
language plpgsql security definer set search_path = '' as $$
declare
  saved public.notes;
begin
  if coalesce((select r.view_records_scope from private.my_role() r where r.id is not null), 'own') <> 'all' then
    raise exception 'Only the manager can mark notes done' using errcode = '42501';
  end if;
  update public.notes n set done_at = now(), done_by = auth.uid()
  where n.id = p_note_id and n.done_at is null;
  select * into saved from public.notes n where n.id = p_note_id;
  if not found then
    raise exception 'That note is no longer there';
  end if;
  return saved;
end $$;

revoke all on function public.add_note(uuid, text, public.note_tag, timestamptz) from public, anon;
revoke all on function public.mark_note_done(uuid) from public, anon;
grant execute on function public.add_note(uuid, text, public.note_tag, timestamptz) to authenticated;
grant execute on function public.mark_note_done(uuid) to authenticated;
