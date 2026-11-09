-- Local test data for `npm run db:reset` (supabase db reset applies the migrations, then this file).
-- Never run against the real project: it creates sign-ins with known PINs.
--
-- Sign in (npm run dev:localdb) with a username and PIN:
--   carly / carly-local (manager, password)   gladys / 204816 (team lead)
--   josh / 318274   kyle / 529163   gino / 740352   angel / 863091
-- (the same secrets as the demo accounts in src/mocks/credentials.ts)
--
-- Test cases for the attendance fixes (D = today in Sydney):
--   1. Josh   now      Open clock-in 2 hours before his shift (off-start flag): try "This was a mistake".
--   2. Kyle   D-2 am   Tapped Clock in at 5:10 am at home, asked to remove it: a void request waiting for Carly.
--   3. Gino   D-3 pm   A clock-in from home, already voided by Carly (shows with "Show voided").
--   4. Angel  D-3      A 1-minute unscheduled session (short-session flag).
--   5. Gladys now      Open unscheduled clock-in: clock in from a second tab to see "already clocked in".
--   6. Kyle   D-1 am   Forgot to clock out: closed automatically at 10:00 am, notice not answered yet.
--   7. Gino   D-1 pm   Clocked out 28 min late at the gym; asked for the time after the fact ("stayed to finish").
--   8. Angel  D-2 pm   Clocked out 40 min late, 4 km away; says she forgot and finished at 10:00 pm.
-- Upcoming shifts fill the rest of the fortnight from now on (none in the past, so no no-show noise).

-- ---- Helpers for this file only (pg_temp: gone when the seed finishes) ----

-- A local date and time at the gym.
create function pg_temp.at(d date, t time) returns timestamptz
language sql immutable as $$ select (d + t) at time zone 'Australia/Sydney' $$;

-- A published shift made by Carly. A slot already taken is skipped (returns null).
create function pg_temp.shift(d date, kind public.shift_type, start_at time, end_at time, who uuid) returns uuid
language plpgsql as $$
declare
  made uuid;
begin
  insert into public.shifts (date, type, start_time, end_time, assigned_user_id, created_by)
  values (d, kind, start_at, end_at, who, '00000000-0000-4000-8000-000000000001')
  on conflict do nothing
  returning id into made;
  update public.shifts s set status = 'published', published_at = now() where s.id = made;
  return made;
end $$;

-- A clock event from the phone at a past time, with a GPS fix (±8 m) and its distance from the gym.
create function pg_temp.clock(who uuid, shift uuid, kind public.clock_kind, at timestamptz, lat double precision, lng double precision) returns uuid
language sql as $$
  insert into public.clock_events (user_id, shift_id, kind, server_time, location_status, lat, lng, accuracy_m, distance_m)
  select who, shift, kind, at, 'ok', lat, lng, 8, round(private.distance_m(lat, lng, s.gym_lat, s.gym_lng)) from public.site_settings s
  returning id
$$;

-- A flag as clock_in / clock_out / the scheduled job would have raised it at that time.
create function pg_temp.flag(kind public.flag_kind, who uuid, shift uuid, event uuid, detail text, at timestamptz) returns void
language sql as $$
  insert into public.flags (kind, user_id, shift_id, clock_event_id, detail, created_at) values (kind, who, shift, event, detail, at)
$$;

do $$
declare
  tz constant text := 'Australia/Sydney';
  d date := (now() at time zone tz)::date;
  gym_lat constant double precision := -33.78040309069026;
  gym_lng constant double precision := 151.12136047301382;
  carly constant uuid := '00000000-0000-4000-8000-000000000001';
  gladys constant uuid := '00000000-0000-4000-8000-000000000002';
  josh constant uuid := '00000000-0000-4000-8000-000000000003';
  kyle constant uuid := '00000000-0000-4000-8000-000000000004';
  gino constant uuid := '00000000-0000-4000-8000-000000000005';
  angel constant uuid := '00000000-0000-4000-8000-000000000006';
  person record;
  sh uuid;
  ev uuid;
  ev2 uuid;
  req uuid;
  slot record;
  i integer;
begin
  -- ---- Site ----
  insert into public.site_settings (site_name, gym_lat, gym_lng, radius_m, no_show_after_min, missing_out_after_min, standard_shift_min,
    max_shift_min, max_extension_request_min, roster_anchor_date, default_morning_start, default_night_start,
    max_photos_per_shift, photo_upload_window_min, photo_remove_window_min, photo_retention_months)
  values ('World Gym Macquarie Park', gym_lat, gym_lng, 150, 90, 30, 180, 210, 30, '2026-10-26', '07:00', '19:00', 10, 180, 10, 6);

  -- ---- People: a Supabase login (hidden address, hashed PIN) and a staff row each ----
  for person in
    select * from (values
      (carly, 'Carly', 'carly', 'manager'::public.role_id, null::uuid, 'carly-local'),
      (gladys, 'Gladys', 'gladys', 'team_lead', null, '204816'),
      (josh, 'Josh Lagos', 'josh', 'cleaner', gladys, '318274'),
      (kyle, 'Kyle', 'kyle', 'cleaner', gladys, '529163'),
      (gino, 'Gino', 'gino', 'cleaner', gladys, '740352'),
      (angel, 'Angel', 'angel', 'cleaner', null, '863091')
    ) as p(id, full_name, username, role, team_lead_id, secret)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', person.id, 'authenticated', 'authenticated', person.username || '@staff.gymshift.invalid',
      extensions.crypt(person.secret, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), person.id, person.id::text, 'email',
      jsonb_build_object('sub', person.id::text, 'email', person.username || '@staff.gymshift.invalid', 'email_verified', true), now(), now(), now());
  end loop;
  -- Team leads first, so the cleaners can point at them.
  insert into public.users (id, full_name, username, role, team_lead_id) values
    (carly, 'Carly', 'carly', 'manager', null),
    (gladys, 'Gladys', 'gladys', 'team_lead', null),
    (josh, 'Josh Lagos', 'josh', 'cleaner', gladys),
    (kyle, 'Kyle', 'kyle', 'cleaner', gladys),
    (gino, 'Gino', 'gino', 'cleaner', gladys),
    (angel, 'Angel', 'angel', 'cleaner', null);
  -- Contact details are optional; Josh gave a mobile.
  insert into public.user_contacts (user_id, phone, updated_by) values (josh, '+61412345678', carly);

  -- ---- Case 2: Kyle, D-2 morning. A tap at home, asked about at once (that closed it), then the real shift ----
  sh := pg_temp.shift(d - 2, 'morning', '07:00', '10:00', kyle);
  ev := pg_temp.clock(kyle, sh, 'in', pg_temp.at(d - 2, '05:10'), -33.79600, 151.14286);
  perform pg_temp.flag('off_start', kyle, sh, ev, 'Clock-in 1h 50m before the 7:00 am start', pg_temp.at(d - 2, '05:10'));
  ev2 := pg_temp.clock(kyle, sh, 'out', pg_temp.at(d - 2, '05:25'), -33.79600, 151.14286);
  perform pg_temp.flag('off_site', kyle, sh, ev2, format('Clock-out %s m from gym (±8 m)', round(private.distance_m(-33.79600, 151.14286, gym_lat, gym_lng))), pg_temp.at(d - 2, '05:25'));
  insert into public.correction_requests (kind, clock_event_id, requested_by, reason_code, created_at)
  values ('void', ev, kyle, 'accidental_tap', pg_temp.at(d - 2, '05:25'));
  perform pg_temp.clock(kyle, sh, 'in', pg_temp.at(d - 2, '07:01'), gym_lat, gym_lng);
  perform pg_temp.clock(kyle, sh, 'out', pg_temp.at(d - 2, '10:00'), gym_lat, gym_lng);

  -- ---- Case 3: Gino, D-3 night. A clock-in from home that afternoon, voided by Carly; then the real shift ----
  sh := pg_temp.shift(d - 3, 'night', '19:00', '22:00', gino);
  ev := pg_temp.clock(gino, sh, 'in', pg_temp.at(d - 3, '14:05'), -33.81370, 151.10056);
  perform pg_temp.flag('off_site', gino, sh, ev, format('Clock-in %s m from gym (±8 m)', round(private.distance_m(-33.81370, 151.10056, gym_lat, gym_lng))), pg_temp.at(d - 3, '14:05'));
  perform pg_temp.flag('off_start', gino, sh, ev, 'Clock-in 4h 55m before the 7:00 pm start', pg_temp.at(d - 3, '14:05'));
  ev2 := pg_temp.clock(gino, sh, 'out', pg_temp.at(d - 3, '14:07'), -33.81370, 151.10056);
  perform pg_temp.flag('short_session', gino, sh, ev2, 'Clocked out 2 min after clocking in', pg_temp.at(d - 3, '14:07'));
  insert into public.clock_voids (clock_event_id, old_time, reason, voided_by, voided_at)
  select e.id, e.server_time, 'Tapped Clock in at home', carly, pg_temp.at(d - 3, '15:00') from public.clock_events e where e.id in (ev, ev2);
  update public.flags f set resolved_at = pg_temp.at(d - 3, '15:00'), resolved_by = carly where f.clock_event_id in (ev, ev2);
  perform pg_temp.clock(gino, sh, 'in', pg_temp.at(d - 3, '18:57'), gym_lat, gym_lng);
  perform pg_temp.clock(gino, sh, 'out', pg_temp.at(d - 3, '22:01'), gym_lat, gym_lng);

  -- ---- Case 4: Angel, D-3. A 1-minute unscheduled session ----
  ev := pg_temp.clock(angel, null, 'in', pg_temp.at(d - 3, '12:00'), gym_lat, gym_lng);
  perform pg_temp.flag('unscheduled', angel, null, ev, 'Clock-in with no rostered shift', pg_temp.at(d - 3, '12:00'));
  ev2 := pg_temp.clock(angel, null, 'out', pg_temp.at(d - 3, '12:01'), gym_lat, gym_lng);
  perform pg_temp.flag('short_session', angel, null, ev2, 'Clocked out 1 min after clocking in', pg_temp.at(d - 3, '12:01'));

  -- ---- Case 8: Angel, D-2 night. Clocked out 40 min late from home; says she forgot and left at 10:00 pm ----
  sh := pg_temp.shift(d - 2, 'night', '19:00', '22:00', angel);
  perform pg_temp.clock(angel, sh, 'in', pg_temp.at(d - 2, '19:00'), gym_lat, gym_lng);
  perform pg_temp.flag('missing_clock_out', angel, sh, (select e.id from public.clock_events e where e.shift_id = sh and e.kind = 'in'), 'No clock-out by 10:30 pm', pg_temp.at(d - 2, '22:30'));
  ev2 := pg_temp.clock(angel, sh, 'out', pg_temp.at(d - 2, '22:40'), -33.76900, 151.08316);
  perform pg_temp.flag('off_site', angel, sh, ev2, format('Clock-out %s m from gym (±8 m)', round(private.distance_m(-33.76900, 151.08316, gym_lat, gym_lng))), pg_temp.at(d - 2, '22:40'));
  perform pg_temp.flag('over_without_extension', angel, sh, ev2, 'Recorded 3h 40m; approved 3h 0m', pg_temp.at(d - 2, '22:40'));
  insert into public.correction_requests (kind, clock_event_id, requested_by, reason_code, requested_time, created_at)
  values ('end_time', ev2, angel, 'forgot_clock_out', pg_temp.at(d - 2, '22:00'), pg_temp.at(d - 2, '22:41'));

  -- ---- Case 6: Kyle, D-1 morning. Forgot to clock out; the job closed it at the rostered end ----
  sh := pg_temp.shift(d - 1, 'morning', '07:00', '10:00', kyle);
  ev := pg_temp.clock(kyle, sh, 'in', pg_temp.at(d - 1, '07:02'), gym_lat, gym_lng);
  perform pg_temp.flag('missing_clock_out', kyle, sh, ev, 'No clock-out by 10:30 am', pg_temp.at(d - 1, '10:30'));
  insert into public.clock_events (user_id, shift_id, kind, server_time, location_status, source, assumed_time)
  values (kyle, sh, 'out', pg_temp.at(d - 1, '12:00'), 'unavailable', 'auto', pg_temp.at(d - 1, '10:00'));

  -- ---- Case 7: Gino, D-1 night. Stayed to finish, clocked out 28 min late at the gym, asked for the time after ----
  sh := pg_temp.shift(d - 1, 'night', '19:00', '22:00', gino);
  perform pg_temp.clock(gino, sh, 'in', pg_temp.at(d - 1, '18:58'), gym_lat, gym_lng);
  ev2 := pg_temp.clock(gino, sh, 'out', pg_temp.at(d - 1, '22:28'), -33.78050, 151.12156);
  perform pg_temp.flag('over_without_extension', gino, sh, ev2, 'Recorded 3h 30m; approved 3h 0m', pg_temp.at(d - 1, '22:28'));
  insert into public.extensions (shift_id, requested_by, minutes, reason, created_at)
  values (sh, gino, 30, 'Stayed to finish', pg_temp.at(d - 1, '22:29'));

  -- ---- Case 1: Josh, now. His shift starts in 2 hours; he clocks in anyway (through clock_in, as the phone does) ----
  sh := pg_temp.shift(((now() + interval '2 hours') at time zone tz)::date, 'night',
    to_char((now() + interval '2 hours') at time zone tz, 'HH24:MI')::time, to_char((now() + interval '5 hours') at time zone tz, 'HH24:MI')::time, josh);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', josh, 'role', 'authenticated')::text, true);
  perform public.clock_in('ok', gym_lat + 0.0002, gym_lng, 8);

  -- ---- Case 5: Gladys, now. Clocked in with location blocked and no shift ----
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gladys, 'role', 'authenticated')::text, true);
  perform public.clock_in('denied');
  perform set_config('request.jwt.claims', '{}', true);

  -- ---- The rest of the fortnight (and the next), from now on ----
  for i in 0..13 loop
    for slot in
      select * from (values ('morning'::public.shift_type, time '07:00', time '10:00'), ('night', time '19:00', time '22:00')) as v(type, start_at, end_at)
    loop
      continue when pg_temp.at(d + i, slot.start_at) <= now();
      perform pg_temp.shift(d + i, slot.type, slot.start_at, slot.end_at,
        (array[josh, kyle, gino, angel, gladys])[1 + (i * 2 + (slot.type = 'night')::integer) % 5]);
    end loop;
  end loop;
end $$;
