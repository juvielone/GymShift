-- Work photos (PRD F7). Images go in a private Storage bucket; the photos table is the record.
-- Same checks and wording as src/data/photos.ts. The limits come from site_settings.
--
-- Upload: the phone puts the compressed JPEG at <user id>/<shift id>/<uuid>.jpg (Storage lets you write
-- only into your own folder, for your own shift), then calls add_photo, which checks the rules and saves
-- the row with the database's time. An image without a row is never shown, and its uploader can delete it.
-- View: a short-lived signed link, for anyone whose records scope covers the photo.
-- Remove: remove_photo marks the row (who, when; the row stays forever), then the phone deletes the image.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shift-photos', 'shift-photos', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

-- "<user id>/<shift id>/<uuid>.jpg", written by that user for a shift assigned to them.
create function private.is_own_photo_path(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.is_staff()
    and path ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$')
    and exists (select 1 from public.shifts s where s.id::text = split_part(path, '/', 2) and s.assigned_user_id = auth.uid()),
    false)
$$;

-- Which images a signed-in person may read through Storage (a signed link, or before deleting one).
create function private.can_read_photo_object(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      -- A shown photo: whoever may see that person's records.
      when p.removed_at is null then private.can_view_records_of(p.user_id)
      -- A removed photo: only the person who removed it, to delete the image.
      else p.removed_by = auth.uid()
    end
    from public.photos p where p.storage_path = path),
    -- An image that never got a row (the save failed): its uploader, to clean it up.
    private.is_own_photo_path(path))
$$;

create function private.can_delete_photo_object(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.removed_at is not null and p.removed_by = auth.uid() from public.photos p where p.storage_path = path),
    private.is_own_photo_path(path))
$$;

create policy shift_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shift-photos' and private.is_own_photo_path(name)
    and not exists (select 1 from public.photos p where p.storage_path = name));
create policy shift_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'shift-photos' and private.can_read_photo_object(name));
create policy shift_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shift-photos' and private.can_delete_photo_object(name));

-- Own shift only, from clock-in until the upload window after clock-out closes, up to the shift's limit.
create function public.add_photo(p_shift_id uuid, p_storage_path text) returns public.photos
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s public.site_settings;
  sh public.shifts;
  last_out uuid;
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

  if not exists (select 1 from public.clock_events e where e.shift_id = p_shift_id and e.kind = 'in') then
    raise exception 'Photos can be added once you clock in';
  end if;
  select e.id into last_out from public.clock_events e where e.shift_id = p_shift_id and e.kind = 'out' order by e.server_time desc limit 1;
  if last_out is not null and now() > private.effective_time(last_out) + make_interval(mins => s.photo_upload_window_min) then
    raise exception 'Photos for this shift have closed';
  end if;
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
    insert into public.photos (shift_id, user_id, storage_path, size_bytes, expires_at)
    values (p_shift_id, me, p_storage_path, size_bytes, now() + make_interval(months => s.photo_retention_months))
    returning * into saved;
  exception when unique_violation then
    raise exception 'That photo is already saved';
  end;
  return saved;
end $$;

-- The uploader within the remove window (a mistake), or the manager at any time. Removing twice changes nothing.
create function public.remove_photo(p_photo_id uuid) returns public.photos
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s public.site_settings;
  ph public.photos;
begin
  if not private.is_staff() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into s from public.site_settings;
  select * into ph from public.photos p where p.id = p_photo_id;
  if not found then
    raise exception 'That photo is no longer there';
  end if;
  if ph.removed_at is not null then
    return ph;
  end if;
  if not ((ph.user_id = me and now() < ph.uploaded_at + make_interval(mins => s.photo_remove_window_min))
      or coalesce((select r.can_correct_attendance from private.my_role() r where r.id is not null), false)) then
    raise exception 'Photos can be removed for % minutes after adding them', s.photo_remove_window_min using errcode = '42501';
  end if;

  update public.photos p set removed_at = now(), removed_by = me where p.id = p_photo_id returning * into ph;
  return ph;
end $$;

-- The policy helpers run as the person asking (Storage checks them per request), so they stay callable.
revoke all on function private.is_own_photo_path(text) from public, anon;
revoke all on function private.can_read_photo_object(text) from public, anon;
revoke all on function private.can_delete_photo_object(text) from public, anon;
grant execute on function private.is_own_photo_path(text) to authenticated;
grant execute on function private.can_read_photo_object(text) to authenticated;
grant execute on function private.can_delete_photo_object(text) to authenticated;

revoke all on function public.add_photo(uuid, text) from public, anon;
revoke all on function public.remove_photo(uuid) from public, anon;
grant execute on function public.add_photo(uuid, text) to authenticated;
grant execute on function public.remove_photo(uuid) to authenticated;
