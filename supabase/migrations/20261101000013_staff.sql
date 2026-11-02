-- Staff (PRD F1, decided 2 Nov 2026): Carly adds people, changes them, deactivates and reactivates them.
-- Same checks and wording as src/data/users.ts.
--
-- Sign-ins (the hidden address <username>@staff.gymshift.invalid and the PIN as its password) live in
-- auth.users, which only the server may change. The staff Edge Function (supabase/functions/staff) does that
-- part, and calls the functions below AS CARLY first, so every rule is checked here, by the database:
--   create:    check_staff → (login made) → add_staff
--   new PIN:   check_pin_reset → (password set)
--   new name:  check_staff → (login renamed) → update_staff
-- A PIN never reaches these tables. Other changes (name, role, group, phone) and (de)activating are plain
-- database functions the app calls itself. People are never deleted (users_never_deleted in 02_guards).

-- ---- Contact details: only Carly and the person can see them ----

-- Everyone can read users (names for the roster), so a phone number lives in its own table.
alter table users drop column email;

create table user_contacts (
  user_id uuid primary key references users (id),
  -- Australian mobile, +614xxxxxxxx. Contact only: never used to sign in, never verified.
  phone text check (phone ~ '^\+614[0-9]{8}$'),
  updated_by uuid not null references users (id),
  updated_at timestamptz not null default now()
);
create trigger user_contacts_never_deleted before delete on user_contacts for each row execute function private.forbid();

revoke all on user_contacts from anon, authenticated;
grant select on user_contacts to authenticated;
alter table user_contacts enable row level security;
create policy user_contacts_read on user_contacts for select to authenticated
  using (private.is_staff() and (user_id = auth.uid() or coalesce((select r.can_manage_users from private.my_role() r where r.id is not null), false)));

-- ---- Helpers ----

-- The login address a username signs in with (LOGIN_DOMAIN in src/data/live.ts and the Edge Function).
create function private.login_email(p_username text) returns text
language sql immutable set search_path = '' as $$
  select p_username || '@staff.gymshift.invalid'
$$;

-- "  Josh   Lagos " → "Josh Lagos".
create function private.tidy_name(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')
$$;

-- "0412 345 678", "+61 412 345 678" → "+61412345678"; blank → null (normalisePhone() in src/data/users.ts).
create function private.normalise_phone(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  digits text := regexp_replace(coalesce(p, ''), '[[:space:]().-]', '', 'g');
  local_part text;
begin
  if digits = '' then
    return null;
  end if;
  local_part := case
    when digits like '+61%' then substr(digits, 4)
    when digits like '61%' and length(digits) = 11 then substr(digits, 3)
    else regexp_replace(digits, '^0', '')
  end;
  if local_part !~ '^4[0-9]{8}$' then
    raise exception 'Use an Australian mobile number, like 0412 345 678';
  end if;
  return '+61' || local_part;
end $$;

create function private.require_staff_manager() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select r.can_manage_users from private.my_role() r where r.id is not null), false) then
    raise exception 'Only the manager can manage staff' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- Two active people with one first name need a surname (or initial) to tell them apart (checkName()).
create function private.check_staff_name(p_full_name text, p_self uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  wanted text := private.tidy_name(p_full_name);
  twin text;
begin
  if wanted = '' then
    raise exception 'Add their name';
  end if;
  select u.full_name into twin from public.users u
  where u.id is distinct from p_self and u.active and lower(split_part(private.tidy_name(u.full_name), ' ', 1)) = lower(split_part(wanted, ' ', 1))
  -- Someone with the very same name first, if there is one.
  order by lower(private.tidy_name(u.full_name)) = lower(wanted) desc
  limit 1;
  if twin is null then
    return;
  end if;
  if position(' ' in wanted) = 0 then
    raise exception '% is also on the team. Add a surname or initial.', twin;
  end if;
  if lower(private.tidy_name(twin)) = lower(wanted) then
    raise exception 'Someone is already called %. Add more of the surname.', twin;
  end if;
end $$;

-- Everything about a person's details (checkDetails()). p_self: the person being changed, null when adding.
create function private.check_staff_details(p_self uuid, p_full_name text, p_username text, p_role public.role_id, p_team_lead_id uuid, p_phone text)
returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  wanted text := lower(btrim(coalesce(p_username, '')));
  taken text;
begin
  perform private.check_staff_name(p_full_name, p_self);
  if wanted !~ '^[a-z][a-z0-9]{1,19}$' then
    raise exception 'Use a username of 2 to 20 letters or numbers, starting with a letter';
  end if;
  select u.full_name into taken from public.users u where u.id is distinct from p_self and u.username = wanted;
  if taken is not null then
    raise exception '% already uses that username', taken;
  end if;
  if p_role is null or p_role not in ('cleaner', 'team_lead') then
    raise exception 'Choose Cleaner or Team lead';
  end if;
  if p_team_lead_id is not null and not exists (
    select 1 from public.users u where u.id = p_team_lead_id and u.role = 'team_lead' and u.active and u.id is distinct from p_self) then
    raise exception 'Choose an active team lead';
  end if;
  perform private.normalise_phone(p_phone);
end $$;

-- The person Carly is changing: anyone but the manager (her own account isn't changed here).
create function private.staff_target(p_user_id uuid, message text) returns public.users
language plpgsql stable security definer set search_path = '' as $$
declare
  target public.users;
begin
  select * into target from public.users u where u.id = p_user_id;
  if not found then
    raise exception 'That person is no longer there';
  end if;
  if target.id = auth.uid() or target.role = 'manager' then
    raise exception '%', message;
  end if;
  return target;
end $$;

-- Saves the phone (or clears it). Changed in place: contact details aren't an hours record.
create function private.save_contact(p_user_id uuid, p_phone text, p_by uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  normal text := private.normalise_phone(p_phone);
begin
  insert into public.user_contacts (user_id, phone, updated_by)
  select p_user_id, normal, p_by
  where normal is not null or exists (select 1 from public.user_contacts c where c.user_id = p_user_id)
  on conflict (user_id) do update set phone = excluded.phone, updated_by = excluded.updated_by, updated_at = now()
  where public.user_contacts.phone is distinct from excluded.phone;
end $$;

-- A team lead who stops leading (new role or deactivated) hands their group to the manager.
create function private.release_group(p_lead_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.users u set team_lead_id = null where u.team_lead_id = p_lead_id
$$;

-- ---- Checks the Edge Function makes as Carly, before it touches a login ----

-- Adding (p_user_id null) or changing someone: would these details be saved?
create function public.check_staff(
  p_user_id uuid,
  p_full_name text,
  p_username text,
  p_role public.role_id,
  p_team_lead_id uuid default null,
  p_phone text default null
) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff_manager();
  if p_user_id is not null then
    perform private.staff_target(p_user_id, 'The manager''s own account can''t be changed here');
  end if;
  perform private.check_staff_details(p_user_id, p_full_name, p_username, p_role, case when p_role = 'cleaner' then p_team_lead_id end, p_phone);
end $$;

create function public.check_pin_reset(p_user_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  target public.users;
begin
  perform private.require_staff_manager();
  target := private.staff_target(p_user_id, 'The manager signs in with a password, not a PIN');
  if not target.active then
    raise exception 'Reactivate them first';
  end if;
end $$;

-- ---- Saving ----

-- The staff row for a login the Edge Function has just made. The login must be for this username and have
-- no staff row yet, so a row can't be pointed at someone else's sign-in.
create function public.add_staff(
  p_user_id uuid,
  p_full_name text,
  p_username text,
  p_role public.role_id,
  p_team_lead_id uuid default null,
  p_phone text default null
) returns public.users
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_staff_manager();
  wanted text := lower(btrim(coalesce(p_username, '')));
  lead uuid := case when p_role = 'cleaner' then p_team_lead_id end;
  saved public.users;
begin
  perform private.check_staff_details(null, p_full_name, wanted, p_role, lead, p_phone);
  if not exists (select 1 from auth.users a where a.id = p_user_id and a.email = private.login_email(wanted))
      or exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'Their sign-in wasn''t made. Try again.';
  end if;
  insert into public.users (id, full_name, username, role, team_lead_id)
  values (p_user_id, private.tidy_name(p_full_name), wanted, p_role, lead)
  returning * into saved;
  perform private.save_contact(saved.id, p_phone, me);
  return saved;
end $$;

-- Name, username, role, group and phone. A new username only once its login has been renamed (by the Edge
-- Function), so what people type and what signs them in never drift apart.
create function public.update_staff(
  p_user_id uuid,
  p_full_name text,
  p_username text,
  p_role public.role_id,
  p_team_lead_id uuid default null,
  p_phone text default null
) returns public.users
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_staff_manager();
  target public.users := private.staff_target(p_user_id, 'The manager''s own account can''t be changed here');
  wanted text := lower(btrim(coalesce(p_username, '')));
  lead uuid := case when p_role = 'cleaner' then p_team_lead_id end;
  saved public.users;
begin
  perform private.check_staff_details(target.id, p_full_name, wanted, p_role, lead, p_phone);
  if wanted <> target.username and not exists (select 1 from auth.users a where a.id = target.id and a.email = private.login_email(wanted)) then
    raise exception 'Their sign-in name wasn''t changed. Try again.';
  end if;
  if target.role = 'team_lead' and p_role <> 'team_lead' then
    perform private.release_group(target.id);
  end if;
  update public.users u
  set full_name = private.tidy_name(p_full_name), username = wanted, role = p_role, team_lead_id = lead
  where u.id = target.id
  returning * into saved;
  perform private.save_contact(saved.id, p_phone, me);
  return saved;
end $$;

-- Deactivating keeps everything and stops sign-in (every rule checks users.active). Coming back: their
-- name must still be told apart from anyone who has it now; a cleaner whose lead has gone reports to Carly.
-- The Staff screen then sets a new PIN through the Edge Function.
create function public.set_staff_active(p_user_id uuid, p_active boolean) returns public.users
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_staff_manager();
  target public.users := private.staff_target(p_user_id, 'The manager''s own account can''t be deactivated');
  saved public.users;
begin
  if p_active is null then
    raise exception 'Choose active or not';
  end if;
  if p_active and not target.active then
    perform private.check_staff_name(target.full_name, target.id);
  end if;
  if not p_active and target.role = 'team_lead' then
    perform private.release_group(target.id);
  end if;
  update public.users u
  set active = p_active,
    team_lead_id = case when p_active and not exists (select 1 from public.users l where l.id = u.team_lead_id and l.active) then null else u.team_lead_id end
  where u.id = target.id
  returning * into saved;
  return saved;
end $$;

-- ---- Privileges ----

revoke all on function private.login_email(text) from public, anon, authenticated;
revoke all on function private.tidy_name(text) from public, anon, authenticated;
revoke all on function private.normalise_phone(text) from public, anon, authenticated;
revoke all on function private.require_staff_manager() from public, anon, authenticated;
revoke all on function private.check_staff_name(text, uuid) from public, anon, authenticated;
revoke all on function private.check_staff_details(uuid, text, text, public.role_id, uuid, text) from public, anon, authenticated;
revoke all on function private.staff_target(uuid, text) from public, anon, authenticated;
revoke all on function private.save_contact(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.release_group(uuid) from public, anon, authenticated;

revoke all on function public.check_staff(uuid, text, text, public.role_id, uuid, text) from public, anon;
revoke all on function public.check_pin_reset(uuid) from public, anon;
revoke all on function public.add_staff(uuid, text, text, public.role_id, uuid, text) from public, anon;
revoke all on function public.update_staff(uuid, text, text, public.role_id, uuid, text) from public, anon;
revoke all on function public.set_staff_active(uuid, boolean) from public, anon;
grant execute on function public.check_staff(uuid, text, text, public.role_id, uuid, text) to authenticated;
grant execute on function public.check_pin_reset(uuid) to authenticated;
grant execute on function public.add_staff(uuid, text, text, public.role_id, uuid, text) to authenticated;
grant execute on function public.update_staff(uuid, text, text, public.role_id, uuid, text) to authenticated;
grant execute on function public.set_staff_active(uuid, boolean) to authenticated;
