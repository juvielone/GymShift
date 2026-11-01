-- GymShift schema: one table per file in src/types, column names identical (snake_case).
-- Site timezone is Australia/Sydney. Business-rule numbers live in site_settings, never in code.
-- Differences from the TypeScript types, handled in src/data when it switches to Supabase:
--   roles.can_publish_roster / can_approve_swaps: null here means "cannot" (false in TypeScript).
--   users.id is the Supabase auth user's id (auth.users), so a profile can't exist without a login.

create type role_id as enum ('manager', 'team_lead', 'cleaner');
create type scope as enum ('all', 'own_group', 'own');
create type request_status as enum ('pending', 'approved', 'declined');
create type shift_type as enum ('morning', 'night');
create type shift_status as enum ('draft', 'published', 'cancelled');
create type shift_change_field as enum ('date', 'type', 'start_time', 'end_time', 'assigned_user_id', 'status');
create type clock_kind as enum ('in', 'out');
create type location_status as enum ('ok', 'denied', 'timeout', 'unavailable');
create type swap_kind as enum ('swap', 'cover');
create type note_tag as enum ('supplies_low', 'issue', 'general', 'running_late');
create type flag_kind as enum ('off_site', 'no_location', 'unscheduled', 'no_show', 'missing_clock_out', 'over_without_extension');

-- Permission flags from the PRD role table. RLS policies read these, so a role change is a data change.
create table roles (
  id role_id primary key,
  label text not null,
  can_publish_roster scope check (can_publish_roster <> 'own'),
  can_approve_swaps scope check (can_approve_swaps <> 'own'),
  can_approve_extensions boolean not null,
  can_correct_attendance boolean not null,
  view_records_scope scope not null,
  can_export_hours boolean not null,
  can_manage_users boolean not null
);

create table users (
  id uuid primary key references auth.users (id),
  full_name text not null check (btrim(full_name) <> ''),
  -- Typed at sign-in with a PIN. The login email is derived from it, so it is the sign-in identity.
  username text not null unique check (username ~ '^[a-z][a-z0-9]{1,19}$'),
  email text,
  role role_id not null references roles (id),
  team_lead_id uuid references users (id) check (team_lead_id is distinct from id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index users_team_lead_idx on users (team_lead_id);

-- One row: one site in v1.
create table site_settings (
  site_name text not null,
  timezone text not null default 'Australia/Sydney',
  gym_lat double precision not null check (gym_lat between -90 and 90),
  gym_lng double precision not null check (gym_lng between -180 and 180),
  radius_m integer not null check (radius_m between 50 and 300),
  no_show_after_min integer not null check (no_show_after_min > 0),
  missing_out_after_min integer not null check (missing_out_after_min > 0),
  standard_shift_min integer not null check (standard_shift_min > 0),
  max_shift_min integer not null,
  max_extension_request_min integer not null check (max_extension_request_min > 0),
  roster_anchor_date date not null check (extract(isodow from roster_anchor_date) = 1),
  default_morning_start time not null,
  default_night_start time not null,
  max_photos_per_shift integer not null check (max_photos_per_shift > 0),
  photo_upload_window_min integer not null check (photo_upload_window_min >= 0),
  photo_remove_window_min integer not null check (photo_remove_window_min >= 0),
  photo_retention_months integer not null check (photo_retention_months > 0),
  updated_by uuid references users (id),
  updated_at timestamptz,
  check (max_shift_min >= standard_shift_min)
);
create unique index site_settings_one_row on site_settings ((true));

create table availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  date date not null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type shift_type not null,
  start_time time not null,
  end_time time not null check (end_time <> start_time),
  assigned_user_id uuid not null references users (id),
  status shift_status not null default 'draft',
  fortnight_start date not null check (extract(isodow from fortnight_start) = 1 and date between fortnight_start and fortnight_start + 13),
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  check ((status = 'draft') = (published_at is null))
);
-- One active shift per roster slot (date + type); cancelled ones stay as history.
create unique index shifts_one_per_slot on shifts (date, type) where status <> 'cancelled';
create index shifts_assignee_date_idx on shifts (assigned_user_id, date);
create index shifts_fortnight_idx on shifts (fortnight_start);

create table swaps (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts (id),
  kind swap_kind not null,
  requested_by uuid not null references users (id),
  target_user_id uuid references users (id),
  covered_by uuid references users (id),
  reason text,
  status request_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_by uuid references users (id),
  decided_at timestamptz,
  check ((kind = 'swap') = (target_user_id is not null)),
  check (kind = 'cover' or covered_by is null),
  check (target_user_id is distinct from requested_by),
  check ((status = 'pending') = (decided_by is null and decided_at is null))
);
create index swaps_shift_idx on swaps (shift_id);
-- One open request per shift at a time.
create unique index swaps_one_pending on swaps (shift_id) where status = 'pending';

-- Append-only audit log of changes to published shifts (written by a trigger on shifts).
create table shift_changes (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts (id),
  field shift_change_field not null,
  old_value text not null,
  new_value text not null,
  changed_by uuid not null references users (id),
  changed_at timestamptz not null default now(),
  swap_id uuid references swaps (id)
);
create index shift_changes_shift_idx on shift_changes (shift_id);

-- Append-only. Time fixes go in corrections; the server stamps server_time.
create table clock_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  shift_id uuid references shifts (id),
  kind clock_kind not null,
  server_time timestamptz not null default now(),
  location_status location_status not null,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  accuracy_m double precision check (accuracy_m >= 0),
  distance_m integer check (distance_m >= 0),
  check ((location_status = 'ok') = (lat is not null and lng is not null and accuracy_m is not null and distance_m is not null))
);
create index clock_events_user_time_idx on clock_events (user_id, server_time);
create index clock_events_shift_idx on clock_events (shift_id);

-- Append-only. The latest correction for an event is its effective time.
create table corrections (
  id uuid primary key default gen_random_uuid(),
  clock_event_id uuid not null references clock_events (id),
  old_time timestamptz not null,
  new_time timestamptz not null,
  reason text not null check (btrim(reason) <> ''),
  corrected_by uuid not null references users (id),
  created_at timestamptz not null default now()
);
create index corrections_event_idx on corrections (clock_event_id, created_at);

create table extensions (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts (id),
  requested_by uuid not null references users (id),
  minutes integer not null check (minutes > 0),
  reason text not null check (btrim(reason) <> ''),
  status request_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_by uuid references users (id),
  decided_at timestamptz,
  check ((status = 'pending') = (decided_by is null and decided_at is null))
);
create index extensions_shift_idx on extensions (shift_id);

create table photos (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts (id),
  user_id uuid not null references users (id),
  storage_path text not null unique,
  size_bytes integer not null check (size_bytes > 0),
  uploaded_at timestamptz not null default now(),
  expires_at timestamptz not null,
  removed_at timestamptz,
  removed_by uuid references users (id),
  check ((removed_at is null) = (removed_by is null))
);
create index photos_shift_idx on photos (shift_id);

create table notes (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts (id),
  user_id uuid not null references users (id),
  body text not null check (btrim(body) <> ''),
  tag note_tag,
  arrive_by timestamptz,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references users (id),
  -- arrive_by belongs to 'running_late' notes, and every 'running_late' note has one.
  check (tag is distinct from 'running_late' or arrive_by is not null),
  check (arrive_by is null or tag = 'running_late'),
  check ((done_at is null) = (done_by is null))
);
create index notes_shift_idx on notes (shift_id);
create index notes_open_idx on notes (tag) where done_at is null;

create table flags (
  id uuid primary key default gen_random_uuid(),
  kind flag_kind not null,
  user_id uuid not null references users (id),
  shift_id uuid references shifts (id),
  clock_event_id uuid references clock_events (id),
  detail text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references users (id),
  check ((resolved_at is null) = (resolved_by is null))
);
create index flags_open_idx on flags (created_at) where resolved_at is null;
create index flags_shift_idx on flags (shift_id);

insert into roles (id, label, can_publish_roster, can_approve_swaps, can_approve_extensions, can_correct_attendance, view_records_scope, can_export_hours, can_manage_users) values
  ('manager', 'Manager', 'all', 'all', true, true, 'all', true, true),
  ('team_lead', 'Team lead', 'all', 'all', false, false, 'own_group', false, false),
  ('cleaner', 'Cleaner', null, null, false, false, 'own', false, false);
