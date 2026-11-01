-- Who can read what (PRD role table, CLAUDE.md rule 6). These policies are the real enforcement;
-- the checks in src/data and the UI are conveniences that mirror them.
--
-- The app never writes to a table directly. Every write is a function in public (an RPC) that runs
-- as its owner, checks the caller with auth.uid(), stamps time with now() and raises flags. So the
-- app role gets SELECT only, and only through the policies below.

-- ---- Helpers (private schema: not exposed by the Supabase API) ----

-- The signed-in person's role, or nothing if they aren't an active member of staff.
create function private.my_role() returns public.roles
language sql stable security definer set search_path = '' as $$
  select r.* from public.roles r join public.users u on u.role = r.id
  where u.id = auth.uid() and u.active
$$;

create function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users u where u.id = auth.uid() and u.active)
$$;

-- Records (hours, photos, notes, flags): manager everyone, team lead their group and themselves, cleaner themselves.
create function private.can_view_records_of(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case r.view_records_scope
      when 'all' then true
      when 'own_group' then target = auth.uid() or exists (select 1 from public.users t where t.id = target and t.team_lead_id = auth.uid())
      else target = auth.uid()
    end, false)
  from private.my_role() r
  where r.id is not null
$$;

-- In v1 both roster scopes are 'all' (Gladys rosters everyone on Carly's behalf).
create function private.can_roster() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select r.can_publish_roster is not null from private.my_role() r where r.id is not null), false)
$$;

create function private.can_approve_swaps() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select r.can_approve_swaps is not null from private.my_role() r where r.id is not null), false)
$$;

create function private.can_approve_extensions() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select r.can_approve_extensions from private.my_role() r where r.id is not null), false)
$$;

-- ---- Privileges ----

revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
-- Tables added by later migrations start closed too.
alter default privileges in schema public revoke all on tables from anon, authenticated;

revoke all on all functions in schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;
-- RPC functions are granted one by one in their own migrations.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---- Policies (SELECT only) ----

alter table roles enable row level security;
alter table users enable row level security;
alter table site_settings enable row level security;
alter table availability enable row level security;
alter table shifts enable row level security;
alter table shift_changes enable row level security;
alter table swaps enable row level security;
alter table clock_events enable row level security;
alter table corrections enable row level security;
alter table extensions enable row level security;
alter table photos enable row level security;
alter table notes enable row level security;
alter table flags enable row level security;

-- Everyone on staff sees the role table, the staff list (names for the roster, swaps and pickers) and the site settings.
create policy roles_read on roles for select to authenticated using (private.is_staff());
create policy users_read on users for select to authenticated using (private.is_staff());
create policy site_settings_read on site_settings for select to authenticated using (private.is_staff());

-- Staff only see published (and cancelled) shifts; drafts belong to whoever builds the roster.
create policy shifts_read on shifts for select to authenticated
  using (private.is_staff() and (status <> 'draft' or private.can_roster()));

create policy shift_changes_read on shift_changes for select to authenticated
  using (private.can_roster() or exists (select 1 from public.shifts s where s.id = shift_id and private.can_view_records_of(s.assigned_user_id)));

-- Your own days off; rosterers and swap approvers see everyone's, to roster around them.
create policy availability_read on availability for select to authenticated
  using (private.is_staff() and (user_id = auth.uid() or private.can_roster() or private.can_approve_swaps()));

-- The people in a request see it; so do the approvers.
create policy swaps_read on swaps for select to authenticated
  using (private.is_staff() and (auth.uid() in (requested_by, target_user_id, covered_by) or private.can_approve_swaps()));

create policy extensions_read on extensions for select to authenticated
  using (private.can_view_records_of(requested_by) or private.can_approve_extensions());

-- Attendance and evidence follow the records scope.
create policy clock_events_read on clock_events for select to authenticated using (private.can_view_records_of(user_id));
create policy corrections_read on corrections for select to authenticated
  using (exists (select 1 from public.clock_events e where e.id = clock_event_id and private.can_view_records_of(e.user_id)));
create policy photos_read on photos for select to authenticated using (private.can_view_records_of(user_id));
create policy notes_read on notes for select to authenticated using (private.can_view_records_of(user_id));
create policy flags_read on flags for select to authenticated using (private.can_view_records_of(user_id));
