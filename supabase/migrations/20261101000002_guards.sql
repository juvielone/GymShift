-- Record-keeping rules the database enforces itself, whoever writes: the app, an RPC function,
-- or someone editing in the Supabase dashboard (CLAUDE.md rule 2: never overwrite or delete records).

create schema if not exists private;

-- ---- Never updated / never deleted ----

create function private.forbid() returns trigger
language plpgsql as $$
begin
  raise exception '% rows are never %d', tg_table_name, lower(tg_op);
end $$;

-- Append-only logs: rows are added, never changed or removed.
create trigger clock_events_append_only before update or delete on clock_events for each row execute function private.forbid();
create trigger clock_events_no_truncate before truncate on clock_events execute function private.forbid();
create trigger corrections_append_only before update or delete on corrections for each row execute function private.forbid();
create trigger corrections_no_truncate before truncate on corrections execute function private.forbid();
create trigger shift_changes_append_only before update or delete on shift_changes for each row execute function private.forbid();
create trigger shift_changes_no_truncate before truncate on shift_changes execute function private.forbid();

-- Kept forever (people are deactivated, requests decided, flags resolved, notes finished, photos removed).
create trigger users_never_deleted before delete on users for each row execute function private.forbid();
create trigger site_settings_never_deleted before delete on site_settings for each row execute function private.forbid();
create trigger swaps_never_deleted before delete on swaps for each row execute function private.forbid();
create trigger extensions_never_deleted before delete on extensions for each row execute function private.forbid();
create trigger flags_never_deleted before delete on flags for each row execute function private.forbid();
create trigger notes_never_deleted before delete on notes for each row execute function private.forbid();
-- A removed photo keeps its row; only the image in storage is deleted.
create trigger photos_never_deleted before delete on photos for each row execute function private.forbid();

-- ---- Set once: resolving a flag, finishing a note, removing a photo ----

-- Only the named columns may change, and only from empty to a value. Everything else stays as recorded.
create function private.set_once() returns trigger
language plpgsql as $$
declare
  col text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    if o -> col <> 'null'::jsonb and (o -> col) is distinct from (n -> col) then
      raise exception '%.% is already set and can''t be changed', tg_table_name, col;
    end if;
    o := o - col;
    n := n - col;
  end loop;
  if o <> n then
    raise exception 'On %, only % can change', tg_table_name, array_to_string(tg_argv, ' and ');
  end if;
  return new;
end $$;

create trigger flags_resolve_once before update on flags for each row execute function private.set_once('resolved_at', 'resolved_by');
create trigger notes_done_once before update on notes for each row execute function private.set_once('done_at', 'done_by');
create trigger photos_remove_once before update on photos for each row execute function private.set_once('removed_at', 'removed_by');

-- ---- Requests are decided once ----

-- pending → approved or declined, recording who and when (and, for a cover, who covers). Never re-decided.
create function private.decide_once() returns trigger
language plpgsql as $$
declare
  decision text[] := array['status', 'decided_by', 'decided_at', 'covered_by'];
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

create trigger swaps_decide_once before update on swaps for each row execute function private.decide_once();
create trigger extensions_decide_once before update on extensions for each row execute function private.decide_once();

-- ---- Shifts ----

-- The Monday that starts the fortnight holding d, counted in 14-day steps from the roster anchor.
create function private.fortnight_start_of(d date) returns date
language sql stable set search_path = '' as $$
  select s.roster_anchor_date + (floor((d - s.roster_anchor_date) / 14.0) * 14)::integer
  from public.site_settings s
$$;

create function private.shift_insert() returns trigger
language plpgsql as $$
begin
  if new.status <> 'draft' then
    raise exception 'A new shift starts as a draft and goes live when the fortnight is published';
  end if;
  new.fortnight_start := private.fortnight_start_of(new.date);
  return new;
end $$;

create trigger shifts_insert before insert on shifts for each row execute function private.shift_insert();

-- A draft nobody has seen may be deleted. A published shift is cancelled, never deleted, and every
-- change to it is logged (who, when, old, new). A shift someone clocked into keeps its owner.
create function private.shift_change() returns trigger
language plpgsql as $$
declare
  clocked boolean := exists (select 1 from public.clock_events e where e.shift_id = old.id);
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

create trigger shifts_change before update or delete on shifts for each row execute function private.shift_change();
