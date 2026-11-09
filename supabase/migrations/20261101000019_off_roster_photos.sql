-- Work photos for time worked off the roster (9 Nov 2026). Cleaners often clock in without a rostered shift
-- (an unscheduled clock-in, flagged "not rostered"), and Carly still wants to see the work. Until now a photo
-- needed a shift, so they had no way to add any.
--
-- A photo now belongs to either a rostered shift (shift_id, as before, via add_photo) or an off-roster
-- clock-in (clock_event_id, via add_session_photo). Same rules as a shift: own session only, from clock-in
-- until the upload window after clock-out closes, up to max_photos_per_shift. Same wording as
-- requireCanAddPhoto() in src/data/photos.ts.
-- Storage: "<user id>/<clock-in id>/<uuid>.jpg", written by that user for their own off-roster clock-in.

alter table photos
  alter column shift_id drop not null,
  add column clock_event_id uuid references clock_events (id),
  add constraint photos_one_holder check ((shift_id is null) <> (clock_event_id is null));
create index photos_clock_event_idx on photos (clock_event_id);

-- "<user id>/<shift or clock-in id>/<uuid>.jpg": their own shift, or their own clock-in off the roster.
create or replace function private.is_own_photo_path(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.is_staff()
    and path ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$')
    and (
      exists (select 1 from public.shifts s where s.id::text = split_part(path, '/', 2) and s.assigned_user_id = auth.uid())
      or exists (
        select 1 from public.clock_events e
        where e.id::text = split_part(path, '/', 2) and e.user_id = auth.uid() and e.kind = 'in' and e.shift_id is null)),
    false)
$$;

-- Own off-roster session only, from clock-in until the upload window after its clock-out closes, up to the limit.
create function public.add_session_photo(p_clock_in_id uuid, p_storage_path text) returns public.photos
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s public.site_settings;
  ev public.clock_events;
  out_id uuid;
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
  if out_id is not null and now() > private.photo_window_from(out_id) + make_interval(mins => s.photo_upload_window_min) then
    raise exception 'Photos for this shift have closed';
  end if;
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
    insert into public.photos (clock_event_id, user_id, storage_path, size_bytes, expires_at)
    values (p_clock_in_id, me, p_storage_path, size_bytes, now() + make_interval(months => s.photo_retention_months))
    returning * into saved;
  exception when unique_violation then
    raise exception 'That photo is already saved';
  end;
  return saved;
end $$;

revoke all on function public.add_session_photo(uuid, text) from public, anon;
grant execute on function public.add_session_photo(uuid, text) to authenticated;
