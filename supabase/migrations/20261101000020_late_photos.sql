-- Late work photos (9 Nov 2026). Photos are due from clock-in until the upload window after clock-out
-- (photo_upload_window_min). Once that closes, the person can still add photos to their own shift, or their own
-- off-roster session, until the end of that pay fortnight: flag, don't block. Each such photo is saved with
-- added_late = true, so Carly sees it was added late. After the fortnight ends, nothing more can be added.
-- Mirrors requireCanAddPhoto() and photoLateUntil() in src/data/photos.ts and src/lib/rules.ts.
-- Replaces add_photo() (12_attendance_fixes) and add_session_photo() (19_off_roster_photos).

alter table photos add column added_late boolean not null default false;

-- The end of the fortnight a day belongs to: midnight at the start of the next fortnight, local time.
create function private.photo_late_until(p_day date) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select ((private.fortnight_start_of(p_day) + 14)::timestamp at time zone s.timezone)
  from public.site_settings s
$$;

-- On time (false), late (true), or closed (raises). p_closes is when the normal window closes (null while
-- still clocked in); p_day is the shift's date, or the local date of the off-roster clock-in.
create function private.photo_lateness(p_closes timestamptz, p_day date) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_closes is null or now() <= p_closes then
    return false;
  end if;
  if now() >= private.photo_late_until(p_day) then
    raise exception 'Photos for this shift have closed';
  end if;
  return true;
end $$;

create or replace function public.add_photo(p_shift_id uuid, p_storage_path text) returns public.photos
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s public.site_settings;
  sh public.shifts;
  last_out uuid;
  late boolean;
  size_bytes integer;
  saved public.photos;
begin
  if not private.is_staff() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into s from public.site_settings;
  select * into sh from public.shifts x where x.id = p_shift_id;
  if not found then
    raise exception 'That shift is no longer on the roster';
  end if;
  if sh.assigned_user_id <> me then
    raise exception 'Photos can only be added to your own shift' using errcode = '42501';
  end if;
  -- Counted one upload at a time per shift, so two at once can't both take the last place.
  perform pg_advisory_xact_lock(hashtext('photos:' || p_shift_id::text));

  if not exists (select 1 from public.clock_events e where e.shift_id = p_shift_id and e.kind = 'in' and not private.is_voided(e.id)) then
    raise exception 'Photos can be added once you clock in';
  end if;
  select e.id into last_out from public.clock_events e
  where e.shift_id = p_shift_id and e.kind = 'out' and not private.is_voided(e.id)
  order by e.server_time desc limit 1;
  late := private.photo_lateness(
    case when last_out is null then null else private.photo_window_from(last_out) + make_interval(mins => s.photo_upload_window_min) end,
    sh.date);
  if (select count(*) from public.photos p where p.shift_id = p_shift_id and p.removed_at is null) >= s.max_photos_per_shift then
    raise exception 'A shift can have at most % photos', s.max_photos_per_shift;
  end if;

  if split_part(p_storage_path, '/', 2) <> p_shift_id::text or not private.is_own_photo_path(p_storage_path) then
    raise exception 'That photo isn''t in this shift''s folder';
  end if;
  -- The size Storage recorded, not what the phone says.
  select (o.metadata ->> 'size')::integer into size_bytes
  from storage.objects o where o.bucket_id = 'shift-photos' and o.name = p_storage_path;
  if size_bytes is null or size_bytes <= 0 then
    raise exception 'The photo didn''t upload. Try again.';
  end if;

  begin
    insert into public.photos (shift_id, user_id, storage_path, size_bytes, expires_at, added_late)
    values (p_shift_id, me, p_storage_path, size_bytes, now() + make_interval(months => s.photo_retention_months), late)
    returning * into saved;
  exception when unique_violation then
    raise exception 'That photo is already saved';
  end;
  return saved;
end $$;

create or replace function public.add_session_photo(p_clock_in_id uuid, p_storage_path text) returns public.photos
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s public.site_settings;
  ev public.clock_events;
  out_id uuid;
  late boolean;
  size_bytes integer;
  saved public.photos;
begin
  if not private.is_staff() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into s from public.site_settings;
  select * into ev from public.clock_events e where e.id = p_clock_in_id;
  if not found or ev.kind <> 'in' or private.is_voided(ev.id) then
    raise exception 'That clock-in is no longer on record';
  end if;
  if ev.user_id <> me then
    raise exception 'Photos can only be added to your own shift' using errcode = '42501';
  end if;
  if ev.shift_id is not null then
    raise exception 'Add these photos to the rostered shift';
  end if;
  -- Counted one upload at a time per session, so two at once can't both take the last place.
  perform pg_advisory_xact_lock(hashtext('photos:' || p_clock_in_id::text));

  out_id := private.paired_out(ev.id);
  late := private.photo_lateness(
    case when out_id is null then null else private.photo_window_from(out_id) + make_interval(mins => s.photo_upload_window_min) end,
    (private.effective_time(ev.id) at time zone s.timezone)::date);
  if (select count(*) from public.photos p where p.clock_event_id = p_clock_in_id and p.removed_at is null) >= s.max_photos_per_shift then
    raise exception 'A shift can have at most % photos', s.max_photos_per_shift;
  end if;

  if split_part(p_storage_path, '/', 2) <> p_clock_in_id::text or not private.is_own_photo_path(p_storage_path) then
    raise exception 'That photo isn''t in this shift''s folder';
  end if;
  -- The size Storage recorded, not what the phone says.
  select (o.metadata ->> 'size')::integer into size_bytes
  from storage.objects o where o.bucket_id = 'shift-photos' and o.name = p_storage_path;
  if size_bytes is null or size_bytes <= 0 then
    raise exception 'The photo didn''t upload. Try again.';
  end if;

  begin
    insert into public.photos (clock_event_id, user_id, storage_path, size_bytes, expires_at, added_late)
    values (p_clock_in_id, me, p_storage_path, size_bytes, now() + make_interval(months => s.photo_retention_months), late)
    returning * into saved;
  exception when unique_violation then
    raise exception 'That photo is already saved';
  end;
  return saved;
end $$;

revoke all on function private.photo_late_until(date) from public, anon, authenticated;
revoke all on function private.photo_lateness(timestamptz, date) from public, anon, authenticated;
