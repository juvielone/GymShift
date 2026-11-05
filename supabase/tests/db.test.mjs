// Database rules, tested against real Postgres (PGlite, in memory) with every migration applied.
// Run: npm run test:db
// A small stand-in for Supabase's auth schema (auth.users, auth.uid(), the anon/authenticated roles)
// and Storage (buckets, objects with row-level security) is created first; it is test-only and never
// part of the migrations.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations')

const CARLY = '00000000-0000-4000-8000-000000000001'
const GLADYS = '00000000-0000-4000-8000-000000000002'
const JOSH = '00000000-0000-4000-8000-000000000003'
const KYLE = '00000000-0000-4000-8000-000000000004'
const GYM = { lat: -33.7769, lng: 151.1203 }

const AUTH_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null,
    owner_id text default (auth.uid())::text, metadata jsonb, unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, delete on storage.objects to authenticated;
`

const SEED = `
  insert into site_settings (site_name, gym_lat, gym_lng, radius_m, no_show_after_min, missing_out_after_min, standard_shift_min,
    max_shift_min, max_extension_request_min, roster_anchor_date, default_morning_start, default_night_start,
    max_photos_per_shift, photo_upload_window_min, photo_remove_window_min, photo_retention_months)
  values ('World Gym Macquarie Park', ${GYM.lat}, ${GYM.lng}, 150, 15, 30, 180, 210, 30, '2026-10-26', '07:00', '19:00', 10, 180, 10, 6);
  insert into auth.users (id) values ('${CARLY}'), ('${GLADYS}'), ('${JOSH}'), ('${KYLE}');
  insert into users (id, full_name, username, role, team_lead_id) values
    ('${CARLY}', 'Carly', 'carly', 'manager', null),
    ('${GLADYS}', 'Gladys', 'gladys', 'team_lead', null),
    ('${JOSH}', 'Josh Lagos', 'josh', 'cleaner', '${GLADYS}'),
    ('${KYLE}', 'Kyle', 'kyle', 'cleaner', '${GLADYS}');
`

let db

/** Today and tomorrow in the site's timezone, as the database sees them. */
const days = async () => (await db.query(`select (now() at time zone 'Australia/Sydney')::date::text as today, ((now() at time zone 'Australia/Sydney')::date + 1)::text as tomorrow`)).rows[0]

/** Run fn as a signed-in person (or anon when userId is null), the way requests arrive through the Supabase API. */
async function as(userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`set local role ${userId ? 'authenticated' : 'anon'}`)
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : {})])
    return fn(tx)
  })
}

/** Run fn as the database owner, still carrying a person's identity (for writes the API functions will make later). */
async function owner(userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(userId ? { sub: userId } : {})])
    return fn(tx)
  })
}

async function rejects(promise, pattern) {
  await assert.rejects(promise, (e) => {
    assert.match(e.message, pattern)
    return true
  })
}

/** A draft shift, published at once unless asked not to. */
async function addShift({ date, type, user, start = '19:00', end = '22:00', publish = true }) {
  return owner(CARLY, async (tx) => {
    const { rows } = await tx.query(
      `insert into shifts (date, type, start_time, end_time, assigned_user_id, fortnight_start, created_by)
       values ($1, $2, $3, $4, $5, $1, $6) returning id`,
      [date, type, start, end, user, CARLY],
    )
    if (publish) await tx.query(`update shifts set status = 'published', published_at = now() where id = $1`, [rows[0].id])
    return rows[0].id
  })
}

/** Today's date (Sydney) and a start time `minutesAgo` before now, for a shift that starts on time. */
async function startingAgo(minutesAgo = 0) {
  const { rows } = await db.query(
    `select (t at time zone 'Australia/Sydney')::date::text as date, to_char(t at time zone 'Australia/Sydney', 'HH24:MI') as start,
            to_char((t + interval '3 hours') at time zone 'Australia/Sydney', 'HH24:MI') as end
     from (select now() - make_interval(mins => $1) as t) x`,
    [minutesAgo],
  )
  return rows[0]
}

const clock = (who, kind, loc) =>
  as(who, async (tx) => (await tx.query(`select public.clock_${kind}($1, $2, $3, $4) as r`, [loc.status ?? 'ok', loc.lat ?? null, loc.lng ?? null, loc.accuracy ?? null])).rows[0].r)

/** A new in-memory database with every migration applied and the seed loaded. */
async function freshDb() {
  const fresh = new PGlite()
  await fresh.exec(AUTH_STUB)
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await fresh.exec(readFileSync(join(MIGRATIONS, file), 'utf8'))
  }
  await fresh.exec(SEED)
  return fresh
}

before(async () => {
  db = await freshDb()
})

test('clock-in at the gym links to today’s shift, with the server’s time and no flags', async () => {
  const t = await startingAgo(5)
  const shift = await addShift({ date: t.date, type: 'night', user: JOSH, start: t.start, end: t.end })
  const r = await clock(JOSH, 'in', { lat: GYM.lat, lng: GYM.lng, accuracy: 12 })
  assert.equal(r.event.shift_id, shift)
  assert.equal(r.event.distance_m, 0)
  assert.deepEqual(r.flags, [])
  const drift = (await db.query(`select abs(extract(epoch from now() - $1::timestamptz)) as s`, [r.event.server_time])).rows[0].s
  assert.ok(Number(drift) < 5)
})

test('clock-out away from the gym saves and raises an off-site flag', async () => {
  const r = await clock(JOSH, 'out', { lat: -33.8, lng: 151.1203, accuracy: 20 })
  assert.equal(r.event.kind, 'out')
  // Straight after clocking in, so it is also a short session.
  assert.deepEqual(r.flags.map((f) => f.kind).sort(), ['off_site', 'short_session'])
  assert.match(r.flags.find((f) => f.kind === 'off_site').detail, /^Clock-out \d+ m from gym \(±20 m\)$/)
  assert.equal(r.flags.find((f) => f.kind === 'short_session').detail, 'Clocked out 0 min after clocking in')
})

test('poor accuracy alone never flags', async () => {
  const r = await clock(JOSH, 'in', { lat: -33.7785, lng: 151.1203, accuracy: 200 })
  assert.ok(!r.flags.some((f) => f.kind === 'off_site'))
  await clock(JOSH, 'out', { lat: GYM.lat, lng: GYM.lng, accuracy: 10 })
})

test('no location and no shift: the clock-in still saves, with two flags', async () => {
  const r = await clock(GLADYS, 'in', { status: 'denied' })
  assert.equal(r.event.shift_id, null)
  assert.deepEqual(r.flags.map((f) => f.kind).sort(), ['no_location', 'unscheduled'])
  assert.equal(r.flags.find((f) => f.kind === 'no_location').detail, 'Clock-in: location denied')
})

test('time over the approved length is flagged, never cut', async () => {
  const { today } = await days()
  const shift = await addShift({ date: today, type: 'morning', user: KYLE, start: '07:00', end: '10:00' })
  await owner(null, (tx) =>
    tx.query(`insert into clock_events (user_id, shift_id, kind, server_time, location_status) values ($1, $2, 'in', now() - interval '200 minutes', 'denied')`, [KYLE, shift]),
  )
  const r = await clock(KYLE, 'out', { lat: GYM.lat, lng: GYM.lng, accuracy: 10 })
  const over = r.flags.find((f) => f.kind === 'over_without_extension')
  assert.equal(over.detail, 'Recorded 3h 20m; approved 3h 0m')
})

test('clock events are append-only, even for the database owner', async () => {
  const { rows } = await db.query(`select id from clock_events limit 1`)
  await rejects(db.query(`update clock_events set server_time = now() where id = $1`, [rows[0].id]), /clock_events rows are never updated/)
  await rejects(db.query(`delete from clock_events where id = $1`, [rows[0].id]), /clock_events rows are never deleted/)
  await rejects(db.query(`truncate clock_events cascade`), /never truncated/)
})

test('the app cannot write to tables directly, only through the functions', async () => {
  await rejects(
    as(JOSH, (tx) => tx.query(`insert into clock_events (user_id, kind, location_status) values ($1, 'in', 'denied')`, [JOSH])),
    /permission denied/,
  )
  await rejects(as(JOSH, (tx) => tx.query(`update users set role = 'manager' where id = $1`, [JOSH])), /permission denied/)
  await rejects(as(JOSH, (tx) => tx.query(`select private.raise_flag('no_show', $1, null, null, 'x')`, [KYLE])), /permission denied/)
})

test('records follow the role: own, own group, everyone', async () => {
  const owners = async (who) => new Set((await as(who, (tx) => tx.query(`select user_id from clock_events`))).rows.map((r) => r.user_id))
  assert.deepEqual(await owners(JOSH), new Set([JOSH]))
  assert.deepEqual(await owners(KYLE), new Set([KYLE]))
  assert.deepEqual(await owners(GLADYS), new Set([GLADYS, JOSH, KYLE]))
  assert.deepEqual(await owners(CARLY), new Set([GLADYS, JOSH, KYLE]))
  const kyleSeesJoshFlags = await as(KYLE, (tx) => tx.query(`select 1 from flags where user_id = $1`, [JOSH]))
  assert.equal(kyleSeesJoshFlags.rows.length, 0)
})

test('signed-out visitors see nothing', async () => {
  await rejects(as(null, (tx) => tx.query(`select * from users`)), /permission denied/)
})

test('drafts are seen only by whoever rosters', async () => {
  const { tomorrow } = await days()
  const draft = await addShift({ date: tomorrow, type: 'morning', user: JOSH, start: '07:00', end: '10:00', publish: false })
  const sees = async (who) => (await as(who, (tx) => tx.query(`select 1 from shifts where id = $1`, [draft]))).rows.length === 1
  assert.equal(await sees(JOSH), false)
  assert.equal(await sees(GLADYS), true)
  assert.equal(await sees(CARLY), true)
  // A draft nobody has seen may be deleted.
  await owner(CARLY, (tx) => tx.query(`delete from shifts where id = $1`, [draft]))
})

test('changes to a published shift are logged, and it is cancelled, never deleted', async () => {
  const { tomorrow } = await days()
  const shift = await addShift({ date: tomorrow, type: 'night', user: JOSH })
  await owner(CARLY, (tx) => tx.query(`update shifts set start_time = '18:30' where id = $1`, [shift]))
  const { rows } = await db.query(`select field, old_value, new_value, changed_by from shift_changes where shift_id = $1`, [shift])
  assert.deepEqual(rows, [{ field: 'start_time', old_value: '19:00', new_value: '18:30', changed_by: CARLY }])
  await rejects(owner(CARLY, (tx) => tx.query(`delete from shifts where id = $1`, [shift])), /never deleted\. Cancel it instead/)
  await rejects(owner(null, (tx) => tx.query(`update shifts set start_time = '18:00' where id = $1`, [shift])), /need a signed-in person/)
  await owner(CARLY, (tx) => tx.query(`update shifts set status = 'cancelled' where id = $1`, [shift]))
  await rejects(owner(CARLY, (tx) => tx.query(`update shifts set status = 'published' where id = $1`, [shift])), /was cancelled/)
})

test('a shift someone clocked into keeps its owner and stays on the roster', async () => {
  const { rows } = await db.query(`select shift_id from clock_events where user_id = $1 and shift_id is not null limit 1`, [JOSH])
  await rejects(owner(CARLY, (tx) => tx.query(`update shifts set assigned_user_id = $1 where id = $2`, [KYLE, rows[0].shift_id])), /can't be reassigned/)
  await rejects(owner(CARLY, (tx) => tx.query(`update shifts set status = 'cancelled' where id = $1`, [rows[0].shift_id])), /stays on the roster/)
})

test('a shift moved to another date gets that date’s fortnight', async () => {
  const shift = await addShift({ date: '2026-11-20', type: 'night', user: JOSH, publish: false })
  const { rows } = await db.query(`select fortnight_start::text from shifts where id = $1`, [shift])
  assert.equal(rows[0].fortnight_start, '2026-11-09')
})

test('a request is decided once, and only the decision changes', async () => {
  const { rows: s } = await db.query(`select id from shifts where assigned_user_id = $1 and status = 'published' limit 1`, [KYLE])
  const { rows } = await owner(null, (tx) =>
    tx.query(`insert into extensions (shift_id, requested_by, minutes, reason) values ($1, $2, 20, 'Spill in the weights room') returning id`, [s[0].id, KYLE]),
  )
  const ext = rows[0].id
  await rejects(owner(null, (tx) => tx.query(`update extensions set minutes = 30 where id = $1`, [ext])), /approved or declined|Only the decision/)
  await owner(CARLY, (tx) => tx.query(`update extensions set status = 'approved', decided_by = $1, decided_at = now() where id = $2`, [CARLY, ext]))
  await rejects(owner(CARLY, (tx) => tx.query(`update extensions set status = 'declined' where id = $1`, [ext])), /already decided/)
  await rejects(owner(CARLY, (tx) => tx.query(`delete from extensions where id = $1`, [ext])), /never deleted/)
})

test('a flag is resolved once and never deleted', async () => {
  const { rows } = await db.query(`select id from flags where resolved_at is null limit 1`)
  const id = rows[0].id
  await rejects(db.query(`update flags set detail = 'edited' where id = $1`, [id]), /only resolved_at and resolved_by can change/)
  await db.query(`update flags set resolved_at = now(), resolved_by = $1 where id = $2`, [CARLY, id])
  await rejects(db.query(`update flags set resolved_by = $1 where id = $2`, [GLADYS, id]), /already set/)
  await rejects(db.query(`delete from flags where id = $1`, [id]), /never deleted/)
})

test('a deactivated person can’t clock in or read anything', async () => {
  await db.query(`update users set active = false where id = $1`, [KYLE])
  await rejects(clock(KYLE, 'in', { status: 'timeout' }), /Sign in first/)
  const { rows } = await as(KYLE, (tx) => tx.query(`select * from users`))
  assert.equal(rows.length, 0)
  await db.query(`update users set active = true where id = $1`, [KYLE])
})

test('only the manager moves the gym point; new clock-ins use it, past ones keep their distance', async () => {
  const save = (who, lat, lng, radius) =>
    as(who, async (tx) => (await tx.query(`select * from public.update_site_location($1, $2, $3)`, [lat, lng, radius])).rows[0])
  await rejects(save(GLADYS, -33.78, 151.12, 150), /Only the manager can change site settings/)
  await rejects(save(JOSH, -33.78, 151.12, 150), /Only the manager can change site settings/)
  await rejects(save(null, -33.78, 151.12, 150), /permission denied/)
  await rejects(save(CARLY, -91, 151.12, 150), /Latitude must be between -90 and 90/)
  await rejects(save(CARLY, -33.78, 181, 150), /Longitude must be between -180 and 180/)
  await rejects(save(CARLY, -33.78, 151.12, 40), /Radius must be 50–300 m/)
  await rejects(save(CARLY, -33.78, 151.12, 301), /Radius must be 50–300 m/)

  const before = (await db.query(`select id, distance_m from clock_events where location_status = 'ok' order by server_time limit 1`)).rows[0]
  const moved = { lat: -33.8, lng: 151.1203 }
  const saved = await save(CARLY, moved.lat, moved.lng, 100)
  assert.equal(saved.radius_m, 100)
  assert.equal(saved.updated_by, CARLY)
  assert.ok(saved.updated_at)

  const r = await clock(JOSH, 'in', { lat: moved.lat, lng: moved.lng, accuracy: 10 })
  assert.equal(r.event.distance_m, 0)
  assert.ok(!r.flags.some((f) => f.kind === 'off_site'))
  await clock(JOSH, 'out', { lat: moved.lat, lng: moved.lng, accuracy: 10 })
  const after = (await db.query(`select distance_m from clock_events where id = $1`, [before.id])).rows[0]
  assert.equal(after.distance_m, before.distance_m)

  await save(CARLY, GYM.lat, GYM.lng, 150)
})

// ---- Roster functions (fortnights of 1 and 15 Mar 2027, clear of the tests above) ----

const call = (who, sql, params = []) => as(who, async (tx) => (await tx.query(sql, params)).rows)
const createShift = (who, date, type, user, start = null, end = null) =>
  call(who, `select * from public.create_shift($1, $2, $3, $4, $5)`, [date, type, user, start, end]).then((r) => r[0])

test('rosterers add drafts with times from site settings; one per slot; cleaners can’t roster', async () => {
  const night = await createShift(GLADYS, '2027-03-02', 'night', JOSH)
  assert.equal(night.status, 'draft')
  assert.equal(night.start_time, '19:00:00')
  assert.equal(night.end_time, '22:00:00')
  assert.equal(night.fortnight_start.toISOString?.().slice(0, 10) ?? night.fortnight_start, '2027-03-01')
  assert.equal(night.created_by, GLADYS)
  const morning = await createShift(CARLY, '2027-03-02', 'morning', KYLE, '06:30', '09:30')
  assert.equal(morning.start_time, '06:30:00')

  await rejects(createShift(CARLY, '2027-03-02', 'night', KYLE), /That shift is already on the roster/)
  await rejects(createShift(JOSH, '2027-03-03', 'night', JOSH), /Not allowed to roster this shift/)
  await rejects(createShift(null, '2027-03-03', 'night', JOSH), /permission denied/)
  await rejects(createShift(CARLY, '2027-03-03', 'night', JOSH, '19:00', '19:00'), /can't start and end at the same time/)
  await db.query(`update users set active = false where id = $1`, [KYLE])
  await rejects(createShift(CARLY, '2027-03-03', 'night', KYLE), /no longer active/)
  await db.query(`update users set active = true where id = $1`, [KYLE])
})

test('publishing makes the fortnight’s drafts visible; edits after that are logged with who', async () => {
  await rejects(call(JOSH, `select * from public.publish_fortnight('2027-03-01')`), /Not allowed to roster/)
  const done = await call(GLADYS, `select * from public.publish_fortnight('2027-03-01')`)
  assert.equal(done.length, 2)
  assert.ok(done.every((s) => s.status === 'published' && s.published_at))
  const seen = await call(JOSH, `select id from shifts where date = '2027-03-02' and type = 'night'`)
  assert.equal(seen.length, 1)

  const id = seen[0].id
  const edited = (await call(CARLY, `select * from public.update_shift($1, p_start_time => '18:30', p_assigned_user_id => $2)`, [id, KYLE]))[0]
  assert.equal(edited.start_time, '18:30:00')
  assert.equal(edited.end_time, '22:00:00')
  const log = await db.query(`select field, old_value, new_value, changed_by from shift_changes where shift_id = $1 order by field::text`, [id])
  assert.deepEqual(log.rows, [
    { field: 'start_time', old_value: '19:00', new_value: '18:30', changed_by: CARLY },
    { field: 'assigned_user_id', old_value: JOSH, new_value: KYLE, changed_by: CARLY },
  ].sort((a, b) => a.field.localeCompare(b.field)))
  await rejects(call(JOSH, `select public.update_shift($1, p_start_time => '18:00')`, [id]), /Not allowed to roster this shift/)
})

test('removing: a draft is deleted, a published shift is cancelled, a clocked shift stays', async () => {
  const draft = await createShift(CARLY, '2027-03-04', 'night', JOSH)
  assert.deepEqual(await call(CARLY, `select public.remove_shift($1) as r`, [draft.id]), [{ r: 'deleted' }])
  assert.equal((await db.query(`select 1 from shifts where id = $1`, [draft.id])).rows.length, 0)

  const { rows } = await db.query(`select id from shifts where date = '2027-03-02' and type = 'morning'`)
  assert.deepEqual(await call(GLADYS, `select public.remove_shift($1) as r`, [rows[0].id]), [{ r: 'cancelled' }])
  await rejects(call(GLADYS, `select public.remove_shift($1)`, [rows[0].id]), /already cancelled/)
  await rejects(call(GLADYS, `select public.update_shift($1, p_start_time => '07:00')`, [rows[0].id]), /This shift was cancelled/)
  // The slot is free again.
  await createShift(GLADYS, '2027-03-02', 'morning', JOSH)

  const clocked = (await db.query(`select shift_id from clock_events where user_id = $1 and shift_id is not null limit 1`, [JOSH])).rows[0].shift_id
  await rejects(call(CARLY, `select public.remove_shift($1)`, [clocked]), /stays on the roster/)
  await rejects(call(CARLY, `select public.update_shift($1, p_assigned_user_id => $2)`, [clocked, KYLE]), /can't be reassigned/)
})

test('copying a fortnight makes drafts in the empty slots only, skipping people no longer active', async () => {
  await createShift(CARLY, '2027-03-05', 'night', KYLE)
  await createShift(CARLY, '2027-03-16', 'night', GLADYS) // Already filled in the target: the 2 Mar night copy is skipped.
  await db.query(`update users set active = false where id = $1`, [KYLE])
  const made = await call(GLADYS, `select * from public.copy_fortnight('2027-03-01', '2027-03-15')`)
  await db.query(`update users set active = true where id = $1`, [KYLE])
  // Source: 2 Mar night (Kyle, taken slot and inactive), 2 Mar morning (Josh), 5 Mar night (Kyle, inactive).
  assert.deepEqual(made.map((s) => [s.type, s.assigned_user_id, s.status]), [['morning', JOSH, 'draft']])
  await rejects(call(CARLY, `select * from public.copy_fortnight('2027-03-02', '2027-03-15')`), /Monday a fortnight starts on/)
  await rejects(call(JOSH, `select * from public.copy_fortnight('2027-03-01', '2027-03-29')`), /Not allowed to roster/)
})

test('the trial path: Carly rosters a cleaner for today, publishes, and their clock-in links to it', async () => {
  // Its own database, so today's slots are empty whatever the tests above did.
  const shared = db
  db = await freshDb()
  try {
    const t = await startingAgo(0)
    const fortnight = (await db.query(`select private.fortnight_start_of($1::date)::text as f`, [t.date])).rows[0].f

    const shift = await createShift(CARLY, t.date, 'night', JOSH, t.start, t.end)
    assert.equal((await call(JOSH, `select id from shifts where id = $1`, [shift.id])).length, 0, 'a draft stays hidden')
    await call(CARLY, `select * from public.publish_fortnight($1)`, [fortnight])
    assert.equal((await call(JOSH, `select id from shifts where id = $1`, [shift.id])).length, 1, 'published: the cleaner sees it')

    const r = await clock(JOSH, 'in', { lat: GYM.lat, lng: GYM.lng, accuracy: 10 })
    assert.equal(r.event.shift_id, shift.id)
    assert.deepEqual(r.flags, [])
    const out = await clock(JOSH, 'out', { lat: GYM.lat, lng: GYM.lng, accuracy: 10 })
    assert.equal(out.event.shift_id, shift.id)
  } finally {
    db = shared
  }
})

test('notes: cleaners note their own shift, running late needs a time, only Carly marks done, once', async () => {
  const shared = db
  db = await freshDb()
  try {
    const { today } = await days()
    const fortnight = (await db.query(`select private.fortnight_start_of($1::date)::text as f`, [today])).rows[0].f
    const shift = await createShift(CARLY, today, 'night', JOSH)
    await call(CARLY, `select * from public.publish_fortnight($1)`, [fortnight])
    const note = (who, body, tag = null, arriveBy = null) =>
      call(who, `select * from public.add_note($1, $2, $3, $4)`, [shift.id, body, tag, arriveBy]).then((r) => r[0])

    const supplies = await note(JOSH, '  Out of paper towels  ', 'supplies_low')
    assert.equal(supplies.body, 'Out of paper towels')
    assert.equal(supplies.user_id, JOSH)
    assert.equal(supplies.arrive_by, null)
    await note(JOSH, 'Leak in the men’s showers', 'issue')
    await note(JOSH, 'All good tonight')
    const late = await note(JOSH, 'Train delay', 'running_late', '2030-01-01T09:15:00Z')
    assert.ok(late.arrive_by)
    // An arrival time only belongs on a running-late note.
    assert.equal((await note(JOSH, 'FYI', 'general', '2030-01-01T09:15:00Z')).arrive_by, null)

    await rejects(note(JOSH, 'Late', 'running_late'), /Say about when you will arrive/)
    await rejects(note(JOSH, '   '), /A note needs some text/)
    await rejects(note(KYLE, 'Not my shift'), /Notes can only be added to your own shift/)
    await rejects(note(GLADYS, 'Not my shift'), /Notes can only be added to your own shift/)
    await rejects(note(null, 'Signed out'), /permission denied/)
    assert.equal((await note(CARLY, 'Checked the showers')).user_id, CARLY)

    const done = (who) => call(who, `select * from public.mark_note_done($1)`, [supplies.id]).then((r) => r[0])
    await rejects(done(GLADYS), /Only the manager can mark notes done/)
    await rejects(done(JOSH), /Only the manager can mark notes done/)
    const first = await done(CARLY)
    assert.equal(first.done_by, CARLY)
    assert.ok(first.done_at)
    const again = await done(CARLY)
    assert.equal(String(again.done_at), String(first.done_at))
    await rejects(call(CARLY, `select * from public.mark_note_done('00000000-0000-4000-8000-0000000000ff')`), /no longer there/)

    // Gladys sees her group's notes; Kyle sees none of Josh's.
    assert.equal((await call(GLADYS, `select 1 from notes where user_id = $1`, [JOSH])).length, 5)
    assert.equal((await call(KYLE, `select 1 from notes where user_id = $1`, [JOSH])).length, 0)
  } finally {
    db = shared
  }
})

test('notes for the shift: Carly on anyone’s, a team lead on their group’s; the person on it says “Got it”; taken back, never deleted', async () => {
  const shared = db
  db = await freshDb()
  try {
    const { tomorrow } = await days()
    const fortnight = (await db.query(`select private.fortnight_start_of($1::date)::text as f`, [tomorrow])).rows[0].f
    const shift = await createShift(CARLY, tomorrow, 'night', JOSH)
    const gladysShift = await createShift(CARLY, tomorrow, 'morning', GLADYS)
    const add = (who, shiftId, body) => call(who, `select * from public.add_shift_instruction($1, $2)`, [shiftId, body]).then((r) => r[0])
    const seen = (who, id) => call(who, `select * from public.mark_shift_instruction_seen($1)`, [id]).then((r) => r[0])
    const withdraw = (who, id) => call(who, `select * from public.withdraw_shift_instruction($1)`, [id]).then((r) => r[0])

    // A draft: whoever rosters may already leave a note, but Josh can't see it until it's published.
    const fromCarly = await add(CARLY, shift.id, '  Please do the dusting  ')
    assert.equal(fromCarly.body, 'Please do the dusting')
    assert.equal(fromCarly.author_id, CARLY)
    assert.equal((await call(JOSH, `select 1 from shift_instructions`)).length, 0)
    await rejects(seen(JOSH, fromCarly.id), /This note is for someone else/)
    await call(CARLY, `select * from public.publish_fortnight($1)`, [fortnight])
    assert.equal((await call(JOSH, `select 1 from shift_instructions`)).length, 1)

    const fromGladys = await add(GLADYS, shift.id, 'Delivery at 8, back store room')
    await rejects(add(JOSH, shift.id, 'Note to self'), /This is your own shift/)
    await rejects(add(KYLE, shift.id, 'Hi Josh'), /Only Carly or their team lead can leave a note for this shift/)
    await rejects(add(GLADYS, gladysShift.id, 'Note to self'), /This is your own shift/)
    await rejects(add(CARLY, shift.id, '   '), /A note needs some text/)
    await rejects(add(null, shift.id, 'Signed out'), /permission denied/)
    assert.equal((await add(CARLY, gladysShift.id, 'Mirrors in studio 2')).author_id, CARLY)
    // Kyle sees none of Josh's notes; Gladys sees her group's.
    assert.equal((await call(KYLE, `select 1 from shift_instructions where shift_id = $1`, [shift.id])).length, 0)
    assert.equal((await call(GLADYS, `select 1 from shift_instructions where shift_id = $1`, [shift.id])).length, 2)

    const first = await seen(JOSH, fromCarly.id)
    assert.equal(first.user_id, JOSH)
    const again = await seen(JOSH, fromCarly.id)
    assert.equal(String(again.seen_at), String(first.seen_at))
    await rejects(seen(KYLE, fromCarly.id), /This note is for someone else/)
    assert.equal((await call(CARLY, `select 1 from shift_instruction_reads`)).length, 1)
    assert.equal((await call(KYLE, `select 1 from shift_instruction_reads`)).length, 0)

    await rejects(withdraw(JOSH, fromGladys.id), /Only whoever wrote it, or Carly, can take this note back/)
    const back = await withdraw(GLADYS, fromGladys.id)
    assert.equal(back.withdrawn_by, GLADYS)
    assert.equal(String((await withdraw(CARLY, fromGladys.id)).withdrawn_at), String(back.withdrawn_at))
    await rejects(owner(CARLY, (tx) => tx.query(`delete from shift_instructions where id = $1`, [fromGladys.id])), /rows are never deleted/)
    await rejects(owner(CARLY, (tx) => tx.query(`update shift_instructions set body = 'changed' where id = $1`, [fromCarly.id])), /only withdrawn_at and withdrawn_by can change/)
    await rejects(owner(CARLY, (tx) => tx.query(`delete from shift_instruction_reads`)), /rows are never deleted/)

    // Cancelled and finished shifts take no new notes.
    await call(CARLY, `select * from public.remove_shift($1)`, [gladysShift.id])
    await rejects(add(CARLY, gladysShift.id, 'Too late'), /This shift is cancelled/)
    const past = await addShift({ date: '2020-01-02', type: 'night', user: KYLE })
    await rejects(add(CARLY, past, 'Too late'), /This shift has already finished/)
  } finally {
    db = shared
  }
})

test('the scheduled job flags no-shows and missing clock-outs once, waiting for a running-late time', async () => {
  const shared = db
  db = await freshDb()
  try {
    /** A published shift starting `minutesAgo` before now (Sydney time), 3 hours long. */
    const shiftStarting = async (minutesAgo, type, user) => {
      const { rows } = await db.query(
        `select (t at time zone 'Australia/Sydney')::date::text as date, to_char(t at time zone 'Australia/Sydney', 'HH24:MI') as start,
                to_char((t + interval '3 hours') at time zone 'Australia/Sydney', 'HH24:MI') as end
         from (select now() - make_interval(mins => $1) as t) x`,
        [minutesAgo],
      )
      return addShift({ date: rows[0].date, type, user, start: rows[0].start, end: rows[0].end })
    }
    const clockAt = (user, shift, kind, minutesAgo) =>
      owner(null, (tx) =>
        tx.query(`insert into clock_events (user_id, shift_id, kind, server_time, location_status) values ($1, $2, $3, now() - make_interval(mins => $4), 'denied') returning id`, [user, shift, kind, minutesAgo]),
      ).then((r) => r.rows[0].id)
    const run = async () => (await db.query(`select private.raise_due_flags() as n`)).rows[0].n
    const flagsOf = async (kind) => (await db.query(`select user_id, shift_id, clock_event_id, detail from flags where kind = $1 order by user_id`, [kind])).rows

    // Josh: started 30 min ago, no clock-in → possible no-show.
    const joshShift = await shiftStarting(30, 'night', JOSH)
    // Kyle: started 20 min ago but said he'd arrive in 10 min → not yet.
    const kyleShift = await shiftStarting(20, 'morning', KYLE)
    await owner(null, (tx) => tx.query(`insert into notes (shift_id, user_id, body, tag, arrive_by) values ($1, $2, 'Train delay', 'running_late', now() + interval '10 minutes')`, [kyleShift, KYLE]))
    // Gladys: yesterday's shift, clocked in, never out → missing clock-out.
    const gladysShift = await shiftStarting(28 * 60, 'night', GLADYS)
    const gladysIn = await clockAt(GLADYS, gladysShift, 'in', 28 * 60)
    // Carly: yesterday's shift, clocked in and out → nothing.
    const carlyShift = await shiftStarting(28 * 60, 'morning', CARLY)
    await clockAt(CARLY, carlyShift, 'in', 28 * 60)
    await clockAt(CARLY, carlyShift, 'out', 25 * 60)
    // Josh, earlier today: an unscheduled clock-in 5 hours ago, never closed → missing clock-out after 3h + 30 min.
    const joshUnscheduled = await clockAt(JOSH, null, 'in', 5 * 60)
    // Kyle: a no-show 5 days ago is too old to flag now.
    await shiftStarting(5 * 24 * 60, 'night', KYLE)

    assert.equal(await run(), 3)
    const noShows = await flagsOf('no_show')
    assert.deepEqual(noShows.map((f) => [f.user_id, f.shift_id]), [[JOSH, joshShift]])
    assert.match(noShows[0].detail, /^No clock-in by \d{1,2}:\d{2} [ap]m$/)
    const missing = await flagsOf('missing_clock_out')
    assert.deepEqual(
      missing.map((f) => [f.user_id, f.shift_id, f.clock_event_id]),
      [[GLADYS, gladysShift, gladysIn], [JOSH, null, joshUnscheduled]].sort((a, b) => a[0].localeCompare(b[0])),
    )
    assert.ok(missing.every((f) => /^No clock-out by \d{1,2}:\d{2} [ap]m$/.test(f.detail)))

    // Raised once, however often the job runs.
    assert.equal(await run(), 0)
    // Kyle's arrival time passes (the note said 10 min ago, so due 5 min ago) → now flagged.
    await owner(null, (tx) => tx.query(`insert into notes (shift_id, user_id, body, tag, arrive_by) values ($1, $2, 'Still stuck', 'running_late', now() - interval '20 minutes')`, [kyleShift, KYLE]))
    assert.equal(await run(), 1)
    assert.deepEqual((await flagsOf('no_show')).map((f) => f.user_id).sort(), [JOSH, KYLE].sort())

    // Nobody signed in can run it.
    await rejects(as(CARLY, (tx) => tx.query(`select private.raise_due_flags()`)), /permission denied/)
  } finally {
    db = shared
  }
})

test('only Carly resolves a flag, once; the flagged record is untouched', async () => {
  const shared = db
  db = await freshDb()
  try {
    const r = await clock(JOSH, 'in', { status: 'denied' })
    const flag = r.flags.find((f) => f.kind === 'no_location')
    const resolve = (who, id = flag.id) => call(who, `select * from public.resolve_flag($1)`, [id]).then((rows) => rows[0])

    await rejects(resolve(GLADYS), /Only the manager can resolve flags/)
    await rejects(resolve(JOSH), /Only the manager can resolve flags/)
    await rejects(resolve(null), /permission denied/)
    const first = await resolve(CARLY)
    assert.equal(first.resolved_by, CARLY)
    assert.ok(first.resolved_at)
    assert.equal(first.detail, flag.detail)
    const again = await resolve(CARLY)
    assert.equal(String(again.resolved_at), String(first.resolved_at))
    await rejects(resolve(CARLY, '00000000-0000-4000-8000-0000000000ff'), /no longer there/)

    const ev = (await db.query(`select location_status from clock_events where id = $1`, [r.event.id])).rows[0]
    assert.equal(ev.location_status, 'denied')
  } finally {
    db = shared
  }
})

test('photos: upload into your own folder, saved by add_photo with the rules; removal keeps the row', async () => {
  const shared = db
  db = await freshDb()
  try {
    const { today } = await days()
    const fortnight = (await db.query(`select private.fortnight_start_of($1::date)::text as f`, [today])).rows[0].f
    const shift = (await createShift(CARLY, today, 'night', JOSH)).id
    const kyleShift = (await createShift(CARLY, today, 'morning', KYLE)).id
    await call(CARLY, `select * from public.publish_fortnight($1)`, [fortnight])
    const pathFor = (user, sid = shift) => `${user}/${sid}/${crypto.randomUUID()}.jpg`
    /** Storage upload as that person (what the Storage API does with their sign-in). */
    const upload = (who, path, size = 150_000) =>
      call(who, `insert into storage.objects (bucket_id, name, metadata) values ('shift-photos', $1, $2) returning name`, [path, { size }])
    const add = (who, path, sid = shift) => call(who, `select * from public.add_photo($1, $2)`, [sid, path]).then((r) => r[0])

    // Storage: only your own folder, for your own shift.
    await rejects(upload(JOSH, pathFor(KYLE, kyleShift)), /row-level security/)
    await rejects(upload(JOSH, pathFor(JOSH, kyleShift)), /row-level security/)
    await rejects(upload(JOSH, `${JOSH}/${shift}/../x.jpg`), /row-level security/)

    // Not clocked in yet.
    const early = pathFor(JOSH)
    await upload(JOSH, early)
    await rejects(add(JOSH, early), /Photos can be added once you clock in/)
    await clock(JOSH, 'in', { lat: GYM.lat, lng: GYM.lng, accuracy: 10 })

    const first = await add(JOSH, early)
    assert.equal(first.user_id, JOSH)
    assert.equal(first.size_bytes, 150_000)
    const months = (await db.query(`select round(extract(epoch from expires_at - uploaded_at) / 86400) as d from photos where id = $1`, [first.id])).rows[0].d
    assert.ok(Number(months) >= 180 && Number(months) <= 185, 'kept about 6 months')
    await rejects(add(JOSH, early), /already saved/)
    await rejects(add(JOSH, pathFor(JOSH)), /didn't upload/)
    await rejects(add(KYLE, early), /only be added to your own shift/)

    // Who can see the image: Josh, Gladys (his team lead), Carly; not Kyle.
    const sees = async (who, path) => (await call(who, `select 1 from storage.objects where name = $1`, [path])).length === 1
    assert.deepEqual([await sees(JOSH, early), await sees(GLADYS, early), await sees(CARLY, early), await sees(KYLE, early)], [true, true, true, false])

    // Up to the limit (10); the 11th is refused.
    for (let i = 1; i < 10; i++) {
      const p = pathFor(JOSH)
      await upload(JOSH, p)
      await add(JOSH, p)
    }
    const eleventh = pathFor(JOSH)
    await upload(JOSH, eleventh)
    await rejects(add(JOSH, eleventh), /at most 10 photos/)
    // The image that never got a row: its uploader can clean it up.
    assert.equal((await call(JOSH, `delete from storage.objects where name = $1 returning name`, [eleventh])).length, 1)
    // A saved photo's image can't be deleted while it's shown.
    assert.equal((await call(JOSH, `delete from storage.objects where name = $1 returning name`, [early])).length, 0)

    // Remove: Josh within 10 minutes; then only Carly. The row stays with who and when.
    const removed = (await call(JOSH, `select * from public.remove_photo($1)`, [first.id]))[0]
    assert.equal(removed.removed_by, JOSH)
    assert.equal((await call(JOSH, `delete from storage.objects where name = $1 returning name`, [early])).length, 1)
    assert.equal((await db.query(`select count(*)::int as n from photos where id = $1`, [first.id])).rows[0].n, 1)
    const old = (await owner(null, (tx) =>
      tx.query(`insert into photos (shift_id, user_id, storage_path, size_bytes, uploaded_at, expires_at) values ($1, $2, $3, 1000, now() - interval '20 minutes', now() + interval '6 months') returning id`, [shift, JOSH, pathFor(JOSH)]),
    )).rows[0].id
    await rejects(call(JOSH, `select public.remove_photo($1)`, [old]), /removed for 10 minutes after adding them/)
    await rejects(call(GLADYS, `select public.remove_photo($1)`, [old]), /removed for 10 minutes/)
    assert.equal((await call(CARLY, `select * from public.remove_photo($1)`, [old]))[0].removed_by, CARLY)

    // With a place free again, a new photo fits; after clock-out plus 3 hours, photos close.
    const late = pathFor(JOSH)
    await upload(JOSH, late)
    await owner(null, (tx) => tx.query(`insert into clock_events (user_id, shift_id, kind, server_time, location_status) values ($1, $2, 'out', now() - interval '181 minutes', 'denied')`, [JOSH, shift]))
    await rejects(add(JOSH, late), /Photos for this shift have closed/)
  } finally {
    db = shared
  }
})

// ---- Attendance fixes (12_attendance_fixes): voids, late clock-outs, forgotten clock-outs ----

/** Insert a clock event as the database owner, `minutesAgo` before now. Returns its id. */
const clockAgo = (user, shift, kind, minutesAgo) =>
  owner(null, (tx) =>
    tx.query(`insert into clock_events (user_id, shift_id, kind, server_time, location_status) values ($1, $2, $3, now() - make_interval(mins => $4), 'denied') returning id`, [user, shift, kind, minutesAgo]),
  ).then((r) => r.rows[0].id)

const one = (who, sql, params) => call(who, sql, params).then((r) => r[0])
const truthy = async (sql, params) => Object.values((await db.query(sql, params)).rows[0])[0] === true

test('void: an accidental clock-in is asked about, closed at once, and voided only by Carly; nothing is deleted', async () => {
  const shared = db
  db = await freshDb()
  try {
    const t = await startingAgo(-45)
    const shift = await addShift({ date: t.date, type: 'night', user: JOSH, start: t.start, end: t.end })

    // 45 minutes early: saved and linked, with an off-start flag.
    const first = await clock(JOSH, 'in', { lat: GYM.lat, lng: GYM.lng, accuracy: 10 })
    assert.equal(first.event.shift_id, shift)
    assert.match(first.flags.find((f) => f.kind === 'off_start').detail, /^Clock-in 0h 4[45]m before the \d{1,2}:\d{2} [ap]m start$/)

    // Never two open clock-ins.
    await assert.rejects(clock(JOSH, 'in', { status: 'denied' }), (e) => {
      assert.equal(e.code, 'GS409')
      assert.match(e.message, /^You're already clocked in since \d{1,2}:\d{2} [ap]m$/)
      assert.ok(!Number.isNaN(Date.parse(e.detail)))
      return true
    })

    const ask = (who, event, reason, note = null) =>
      one(who, `select public.request_void($1, $2, $3, 'ok', $4, $5, 10) as r`, [event, reason, note, GYM.lat, GYM.lng]).then((r) => r.r)
    await rejects(ask(KYLE, first.event.id, 'accidental_tap'), /only ask about your own clock-in/)
    await rejects(ask(JOSH, first.event.id, 'other'), /Say what happened/)
    await rejects(ask(JOSH, first.event.id, 'forgot_clock_out'), /Pick what happened/)

    // Asking closes the open session, so Josh is clocked out and can clock in properly; the new one takes the shift.
    const asked = await ask(JOSH, first.event.id, 'accidental_tap')
    assert.equal(asked.request.status, 'pending')
    assert.equal(asked.clock_out.event.kind, 'out')
    assert.ok(!asked.clock_out.flags.some((f) => f.kind === 'short_session'), 'no length flags on the closing clock-out')
    await rejects(ask(JOSH, first.event.id, 'accidental_tap'), /Carly already has this to check/)
    const second = await clock(JOSH, 'in', { lat: GYM.lat, lng: GYM.lng, accuracy: 10 })
    assert.equal(second.event.shift_id, shift)

    // Only Carly decides, once.
    const decide = (who, id, approve) => one(who, `select * from public.decide_correction_request($1, $2)`, [id, approve])
    await rejects(decide(GLADYS, asked.request.id, true), /Only the manager can decide corrections/)
    await rejects(decide(JOSH, asked.request.id, true), /Only the manager can decide corrections/)
    const approved = await decide(CARLY, asked.request.id, true)
    assert.equal(approved.status, 'approved')
    assert.equal(approved.decided_by, CARLY)
    await rejects(decide(CARLY, asked.request.id, false), /already decided/)

    // The clock-in and the clock-out it got are voided (with who, why, and the request); their flags resolved.
    const voids = (await db.query(`select clock_event_id, reason, voided_by, correction_request_id from clock_voids`)).rows
    assert.deepEqual(new Set(voids.map((v) => v.clock_event_id)), new Set([first.event.id, asked.clock_out.event.id]))
    assert.ok(voids.every((v) => v.reason === 'Josh: accidental tap' && v.voided_by === CARLY && v.correction_request_id === asked.request.id))
    assert.equal((await db.query(`select count(*)::int as n from flags where clock_event_id = $1 and resolved_at is null`, [first.event.id])).rows[0].n, 0)
    assert.equal((await db.query(`select count(*)::int as n from clock_events where id = $1`, [first.event.id])).rows[0].n, 1, 'the event stays')

    // Voids are append-only; the app can't write them or the requests directly.
    await rejects(db.query(`update clock_voids set reason = 'x'`), /clock_voids rows are never updated/)
    await rejects(db.query(`delete from clock_voids`), /clock_voids rows are never deleted/)
    await rejects(db.query(`delete from correction_requests`), /correction_requests rows are never deleted/)
    await rejects(call(JOSH, `insert into clock_voids (clock_event_id, old_time, reason, voided_by) values ($1, now(), 'x', $2)`, [second.event.id, JOSH]), /permission denied/)
    await rejects(call(JOSH, `update correction_requests set status = 'approved'`), /permission denied/)
    await rejects(call(JOSH, `update clock_events set shift_id = null`), /permission denied/)

    // Records scope: Gladys (his team lead) and Carly see Josh's voids; Kyle doesn't.
    assert.equal((await call(GLADYS, `select 1 from clock_voids`)).length, 2)
    assert.equal((await call(KYLE, `select 1 from clock_voids`)).length, 0)

    // A rejected request: the session stands, and he can't ask again.
    const again = await ask(JOSH, second.event.id, 'wrong_time')
    assert.equal((await decide(CARLY, again.request.id, false)).status, 'declined')
    assert.equal(await truthy(`select not private.is_voided($1)`, [second.event.id]), true)
    await rejects(ask(JOSH, second.event.id, 'accidental_tap'), /Carly kept this clock-in/)

    // Carly voids directly, with a reason.
    const voidIt = (who, id, reason) => one(who, `select * from public.void_clock_in($1, $2)`, [id, reason])
    await rejects(voidIt(GLADYS, second.event.id, 'Tapped at home'), /Only the manager can void a clock-in/)
    await rejects(voidIt(CARLY, second.event.id, '  '), /A void needs a reason/)
    await rejects(voidIt(CARLY, asked.clock_out.event.id, 'x'), /Only a clock-in can be voided/)
    assert.equal((await voidIt(CARLY, second.event.id, 'Clocked in from home')).voided_by, CARLY)
    await rejects(voidIt(CARLY, second.event.id, 'again'), /already voided/)
    await rejects(one(CARLY, `select * from public.correct_clock_time($1, now(), 'x')`, [second.event.id]), /voided clock event can't be corrected/)

    // Only voided clock-ins on the shift: it can be cancelled.
    assert.deepEqual(await call(CARLY, `select public.remove_shift($1) as r`, [shift]), [{ r: 'cancelled' }])
  } finally {
    db = shared
  }
})

test('late clock-out: "forgot" becomes a correction once Carly approves; "stayed" becomes an extension', async () => {
  const shared = db
  db = await freshDb()
  try {
    // Josh: a 3-hour shift that ended 20 minutes ago; clocked in on time, out now.
    const j = await startingAgo(200)
    const joshShift = await addShift({ date: j.date, type: 'night', user: JOSH, start: j.start, end: j.end })
    const joshIn = await clockAgo(JOSH, joshShift, 'in', 200)
    const joshOut = await clock(JOSH, 'out', { lat: -33.8, lng: 151.1203, accuracy: 10 })
    assert.equal(joshOut.flags.find((f) => f.kind === 'over_without_extension').detail, 'Recorded 3h 20m; approved 3h 0m')

    const askEnd = (who, event, reason, minutesAgo, note = null) =>
      one(who, `select * from public.request_end_time($1, $2, case when $3::int is null then null else now() - make_interval(mins => $3::int) end, $4)`, [event, reason, minutesAgo, note])
    await rejects(askEnd(KYLE, joshOut.event.id, 'forgot_clock_out', 20), /only ask about your own clock-out/)
    await rejects(askEnd(JOSH, joshIn, 'forgot_clock_out', 20), /can't be changed/)
    await rejects(askEnd(JOSH, joshOut.event.id, 'confirm_auto_close', null), /Only an automatic clock-out can be confirmed/)
    await rejects(askEnd(JOSH, joshOut.event.id, 'forgot_clock_out', 300), /between your clock-in and your clock-out/)
    await rejects(askEnd(JOSH, joshOut.event.id, 'forgot_clock_out', -5), /between your clock-in and your clock-out/)
    await rejects(askEnd(JOSH, joshOut.event.id, 'forgot_clock_out', null), /Pick when you finished/)
    const req = await askEnd(JOSH, joshOut.event.id, 'forgot_clock_out', 20)
    assert.equal(req.kind, 'end_time')

    await one(CARLY, `select * from public.decide_correction_request($1, true)`, [req.id])
    const fix = (await db.query(`select reason, corrected_by, abs(extract(epoch from new_time - (now() - interval '20 minutes'))) < 5 as near from corrections where clock_event_id = $1`, [joshOut.event.id])).rows
    assert.deepEqual(fix, [{ reason: 'Josh: forgot to clock out', corrected_by: CARLY, near: true }])
    assert.equal(await truthy(`select private.session_min($1, $2) = 180`, [joshIn, joshOut.event.id]), true)
    assert.equal((await db.query(`select resolved_by from flags where clock_event_id = $1 and kind = 'over_without_extension'`, [joshOut.event.id])).rows[0].resolved_by, CARLY)
    // Within the approved length now: nothing more to ask.
    await rejects(askEnd(JOSH, joshOut.event.id, 'forgot_clock_out', 30), /after your finish time/)

    // Kyle: stayed 30 minutes to finish, then asks for the extension after clocking out.
    const k = await startingAgo(210)
    const kyleShift = await addShift({ date: k.date, type: 'morning', user: KYLE, start: k.start, end: k.end })
    await clockAgo(KYLE, kyleShift, 'in', 210)
    const kyleOut = await clock(KYLE, 'out', { lat: GYM.lat, lng: GYM.lng, accuracy: 10 })
    const askExt = (who, minutes, reason = 'Stayed to finish') => one(who, `select * from public.request_extension($1, $2, $3)`, [kyleShift, minutes, reason])
    await rejects(askExt(JOSH, 30), /Only the assigned cleaner can request an extension/)
    await rejects(askExt(KYLE, 31), /Extensions are 1–30 minutes/)
    await rejects(askExt(KYLE, 30, ' '), /An extension needs a reason/)
    const ext = await askExt(KYLE, 30)
    const decideExt = (who, approve) => one(who, `select * from public.decide_extension($1, $2)`, [ext.id, approve])
    await rejects(decideExt(GLADYS, true), /Only the manager can approve extensions/)
    assert.equal((await decideExt(CARLY, true)).status, 'approved')
    await rejects(decideExt(CARLY, false), /Extension already decided/)
    assert.equal((await db.query(`select resolved_by from flags where clock_event_id = $1 and kind = 'over_without_extension'`, [kyleOut.event.id])).rows[0].resolved_by, CARLY)
    // Never beyond 3.5h in total.
    const more = await askExt(KYLE, 5)
    await rejects(one(CARLY, `select * from public.decide_extension($1, true)`, [more.id]), /beyond 210 minutes/)
  } finally {
    db = shared
  }
})

test('forgotten clock-out: closed at the rostered end two hours after it, labelled, and confirmed or corrected', async () => {
  const shared = db
  db = await freshDb()
  try {
    // Josh: ended 3 hours ago, never clocked out → closed. Kyle: ended 1 hour ago → not yet.
    const j = await startingAgo(360)
    const joshShift = await addShift({ date: j.date, type: 'night', user: JOSH, start: j.start, end: j.end })
    const joshIn = await clockAgo(JOSH, joshShift, 'in', 355)
    const k = await startingAgo(240)
    const kyleShift = await addShift({ date: k.date, type: 'morning', user: KYLE, start: k.start, end: k.end })
    await clockAgo(KYLE, kyleShift, 'in', 240)
    // Gladys: unscheduled, 6 hours ago → closed at clock-in plus 3 hours.
    const gladysIn = await clockAgo(GLADYS, null, 'in', 360)

    const run = async () => (await db.query(`select private.close_forgotten_sessions() as n`)).rows[0].n
    assert.equal(await run(), 2)
    assert.equal(await run(), 0, 'closed once')
    await rejects(call(CARLY, `select private.close_forgotten_sessions()`), /permission denied/)

    const auto = async (user) => (await db.query(`select * from clock_events where user_id = $1 and source = 'auto'`, [user])).rows
    const [joshOut] = await auto(JOSH)
    assert.equal(joshOut.kind, 'out')
    assert.equal(joshOut.shift_id, joshShift)
    assert.equal(joshOut.location_status, 'unavailable')
    assert.equal(await truthy(`select e.assumed_time = private.shift_end_at(sh, 'Australia/Sydney') from clock_events e, shifts sh where e.id = $1 and sh.id = $2`, [joshOut.id, joshShift]), true)
    assert.equal(await truthy(`select private.effective_time($1) = assumed_time from clock_events where id = $1`, [joshOut.id]), true)
    assert.equal((await auto(KYLE)).length, 0)
    const [gladysOut] = await auto(GLADYS)
    assert.equal(await truthy(`select private.session_min($1, $2) = 180`, [gladysIn, gladysOut.id]), true)

    // Carly hears about it (missing clock-out), with no "no location" flag for the job's event.
    const flagKinds = (await db.query(`select kind from flags where clock_event_id in ($1, $2)`, [joshIn, joshOut.id])).rows.map((f) => f.kind)
    assert.deepEqual(flagKinds, ['missing_clock_out'])
    // The job's events are append-only like any other.
    await rejects(db.query(`update clock_events set assumed_time = now() where id = $1`, [joshOut.id]), /never updated/)

    // Josh confirms: approved without a correction, and the flag is resolved.
    const confirm = await one(JOSH, `select * from public.request_end_time($1, 'confirm_auto_close')`, [joshOut.id])
    assert.equal(await truthy(`select requested_time = (select assumed_time from clock_events where id = $2) from correction_requests where id = $1`, [confirm.id, joshOut.id]), true)
    await one(CARLY, `select * from public.decide_correction_request($1, true)`, [confirm.id])
    assert.equal((await db.query(`select count(*)::int as n from corrections where clock_event_id = $1`, [joshOut.id])).rows[0].n, 0)
    assert.equal((await db.query(`select resolved_by from flags where clock_event_id = $1`, [joshIn])).rows[0].resolved_by, CARLY)

    // Gladys says she finished after 2 hours, not 3: a correction once approved.
    const corr = await one(GLADYS, `select * from public.request_end_time($1, 'other', now() - interval '240 minutes', 'Left early, felt sick')`, [gladysOut.id])
    await one(CARLY, `select * from public.decide_correction_request($1, true)`, [corr.id])
    assert.equal(await truthy(`select private.session_min($1, $2) = 120`, [gladysIn, gladysOut.id]), true)
    assert.equal((await db.query(`select reason from corrections where clock_event_id = $1`, [gladysOut.id])).rows[0].reason, 'Gladys: Left early, felt sick')
  } finally {
    db = shared
  }
})

test('staff: Carly adds, changes and deactivates people; the phone is private; nobody is deleted', async () => {
  const shared = db
  db = await freshDb()
  try {
    const NEW = '00000000-0000-4000-8000-000000000010'
    /** The login the Edge Function would make first. */
    const login = (id, username) => db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${username}@staff.gymshift.invalid`])
    const add = (who, id, name, username, role = 'cleaner', lead = null, phone = null) =>
      call(who, `select * from public.add_staff($1, $2, $3, $4, $5, $6)`, [id, name, username, role, lead, phone]).then((r) => r[0])
    const check = (who, id, name, username, role = 'cleaner', lead = null, phone = null) =>
      call(who, `select public.check_staff($1, $2, $3, $4, $5, $6)`, [id, name, username, role, lead, phone])
    const update = (who, id, name, username, role = 'cleaner', lead = null, phone = null) =>
      call(who, `select * from public.update_staff($1, $2, $3, $4, $5, $6)`, [id, name, username, role, lead, phone]).then((r) => r[0])
    const setActive = (who, id, active) => call(who, `select * from public.set_staff_active($1, $2)`, [id, active]).then((r) => r[0])

    // Only Carly, and the same checks as the app.
    await rejects(check(GLADYS, null, 'Gino Rossi', 'gino'), /Only the manager can manage staff/)
    await rejects(check(JOSH, null, 'Gino Rossi', 'gino'), /Only the manager can manage staff/)
    await rejects(check(null, null, 'Gino Rossi', 'gino'), /permission denied/)
    await rejects(check(CARLY, null, '  ', 'gino'), /Add their name/)
    await rejects(check(CARLY, null, 'Josh', 'joshm'), /Josh Lagos is also on the team. Add a surname or initial/)
    await rejects(check(CARLY, null, 'josh  lagos', 'joshm'), /Someone is already called Josh Lagos/)
    await rejects(check(CARLY, null, 'Gino Rossi', 'G'), /2 to 20 letters/)
    await rejects(check(CARLY, null, 'Gino Rossi', 'josh'), /Josh Lagos already uses that username/)
    await rejects(check(CARLY, null, 'Gino Rossi', 'gino', 'manager'), /Choose Cleaner or Team lead/)
    await rejects(check(CARLY, null, 'Gino Rossi', 'gino', 'cleaner', KYLE), /Choose an active team lead/)
    await rejects(check(CARLY, null, 'Gino Rossi', 'gino', 'cleaner', null, '02 9876 5432'), /Australian mobile number/)
    await check(CARLY, null, 'Josh Mendoza', 'joshm', 'cleaner', GLADYS, '0412 345 678')

    // The staff row needs the login for that very username, made first by the Edge Function.
    await rejects(add(CARLY, NEW, 'Josh Mendoza', 'joshm'), /sign-in wasn't made/)
    await login(NEW, 'joshm')
    await rejects(add(CARLY, NEW, 'Josh Mendoza', 'joshx'), /sign-in wasn't made/)
    const added = await add(CARLY, NEW, '  Josh   Mendoza ', 'JoshM', 'cleaner', GLADYS, '+61 412 345 678')
    assert.equal(added.full_name, 'Josh Mendoza')
    assert.equal(added.username, 'joshm')
    assert.equal(added.team_lead_id, GLADYS)
    await rejects(add(CARLY, NEW, 'Josh Mendoza', 'joshm'), /Someone is already called Josh Mendoza/)

    // The phone: Carly and the person, nobody else, and only through the functions.
    const phoneAs = (who) => call(who, `select phone from user_contacts where user_id = $1`, [NEW])
    assert.deepEqual(await phoneAs(CARLY), [{ phone: '+61412345678' }])
    assert.deepEqual(await phoneAs(NEW), [{ phone: '+61412345678' }])
    assert.deepEqual(await phoneAs(GLADYS), [])
    assert.deepEqual(await phoneAs(JOSH), [])
    await rejects(call(CARLY, `update user_contacts set phone = null where user_id = $1`, [NEW]), /permission denied/)
    await rejects(call(CARLY, `select email from users`), /column "email" does not exist/)

    // Changing someone: the username only once their login was renamed.
    await rejects(update(CARLY, CARLY, 'Carly B', 'carly', 'team_lead'), /manager's own account/)
    await rejects(update(GLADYS, NEW, 'Josh Mendoza', 'joshm'), /Only the manager/)
    await rejects(update(CARLY, NEW, 'Josh Mendoza', 'jmendoza'), /sign-in name wasn't changed/)
    await db.query(`update auth.users set email = 'jmendoza@staff.gymshift.invalid' where id = $1`, [NEW])
    const renamed = await update(CARLY, NEW, 'Josh Mendoza', 'jmendoza', 'cleaner', null, '')
    assert.equal(renamed.username, 'jmendoza')
    assert.equal(renamed.team_lead_id, null)
    assert.deepEqual(await phoneAs(CARLY), [{ phone: null }])

    // A team lead who stops leading hands their group to Carly.
    const leadAgain = await update(CARLY, GLADYS, 'Gladys', 'gladys', 'cleaner', null)
    assert.equal(leadAgain.role, 'cleaner')
    const group = (await db.query(`select count(*)::int as n from users where team_lead_id = $1`, [GLADYS])).rows[0].n
    assert.equal(group, 0)

    // PIN resets: active staff other than the manager.
    await rejects(call(CARLY, `select public.check_pin_reset($1)`, [CARLY]), /password, not a PIN/)
    await rejects(call(GLADYS, `select public.check_pin_reset($1)`, [JOSH]), /Only the manager/)
    await call(CARLY, `select public.check_pin_reset($1)`, [JOSH])

    // Deactivating: kept, signed out of everything; reactivating checks the name against who's there now.
    await rejects(setActive(CARLY, CARLY, false), /can't be deactivated/)
    const off = await setActive(CARLY, JOSH, false)
    assert.equal(off.active, false)
    await rejects(call(CARLY, `select public.check_pin_reset($1)`, [JOSH]), /Reactivate them first/)
    assert.deepEqual(await call(JOSH, `select id from users`), [])
    const SECOND = '00000000-0000-4000-8000-000000000011'
    await login(SECOND, 'josh2')
    await add(CARLY, SECOND, 'Josh Lagos', 'josh2')
    await rejects(setActive(CARLY, JOSH, true), /Someone is already called Josh Lagos/)
    await setActive(CARLY, SECOND, false)
    const back = await setActive(CARLY, JOSH, true)
    assert.equal(back.active, true)
    // His lead (Gladys) is no longer a team lead, so he reports to Carly now.
    assert.equal(back.team_lead_id, null)

    await rejects(db.query(`delete from users where id = $1`, [SECOND]), /never|not allowed|forbid/i)
    await rejects(db.query(`delete from user_contacts where user_id = $1`, [NEW]), /never|not allowed|forbid/i)
  } finally {
    db = shared
  }
})

// ---- Swaps, covers and days off (15_swaps) ----

test('swaps: ask a colleague or anyone free, someone says yes, Carly or Gladys approves; nothing is deleted', async () => {
  const shared = db
  db = await freshDb()
  try {
    const ask = (who, shift, target = null, reason = null) =>
      call(who, `select * from public.request_swap($1, $2, $3)`, [shift, target, reason]).then((r) => r[0])
    const answer = (who, id, yes) => call(who, `select * from public.answer_swap($1, $2)`, [id, yes]).then((r) => r[0])
    const decide = (who, id, approve, coveredBy = null) =>
      call(who, `select * from public.decide_swap($1, $2, $3)`, [id, approve, coveredBy]).then((r) => r[0])
    const withdraw = (who, id) => call(who, `select * from public.withdraw_swap($1)`, [id]).then((r) => r[0])
    const owner_ = async (id) => (await db.query(`select assigned_user_id from shifts where id = $1`, [id])).rows[0].assigned_user_id

    const night = await addShift({ date: '2027-04-05', type: 'night', user: JOSH })
    // Kyle works 9 – 11 pm that night (logged as a morning slot so both fit the roster): not free.
    await addShift({ date: '2027-04-05', type: 'morning', user: KYLE, start: '21:00', end: '23:00' })

    // Only the person on the shift asks, never for themselves, and only someone free that night.
    await rejects(ask(KYLE, night, GLADYS), /Only the person on this shift can ask/)
    await rejects(ask(JOSH, night, JOSH), /Pick someone else/)
    await rejects(ask(JOSH, night, KYLE), /Kyle is working then/)
    const swap = await ask(JOSH, night, GLADYS, '  Family ')
    assert.equal(swap.kind, 'swap')
    assert.equal(swap.reason, 'Family')
    await rejects(ask(JOSH, night, null), /already asked about this shift/)

    // The colleague says yes first; nobody else answers for them.
    await rejects(decide(CARLY, swap.id, true), /Gladys hasn't said yes yet/)
    await rejects(answer(KYLE, swap.id, true), /for someone else/)
    const yes = await answer(GLADYS, swap.id, true)
    assert.equal(yes.covered_by, GLADYS)
    assert.ok(yes.accepted_at)
    assert.equal(yes.status, 'pending')
    await rejects(answer(GLADYS, swap.id, true), /already said yes/)

    // Gladys is taking it, so Carly decides. Approving moves the shift and logs it with the request.
    await rejects(decide(GLADYS, swap.id, true), /part of this request, so Carly decides it/)
    await rejects(decide(JOSH, swap.id, true), /Not allowed to decide/)
    const approved = await decide(CARLY, swap.id, true)
    assert.equal(approved.status, 'approved')
    assert.equal(approved.decided_by, CARLY)
    assert.equal(await owner_(night), GLADYS)
    const log = (await db.query(`select field, old_value, new_value, swap_id from shift_changes where shift_id = $1`, [night])).rows
    assert.deepEqual(log, [{ field: 'assigned_user_id', old_value: JOSH, new_value: GLADYS, swap_id: swap.id }])
    await rejects(decide(CARLY, swap.id, false), /already decided/)

    // A cover: every member of staff sees it; anyone free offers; Gladys approves for her group.
    const kyles = await addShift({ date: '2027-04-08', type: 'night', user: KYLE })
    const cover = await ask(KYLE, kyles)
    assert.equal(cover.kind, 'cover')
    assert.equal((await call(JOSH, `select id from swaps where id = $1`, [cover.id])).length, 1)
    await rejects(answer(JOSH, cover.id, false), /Only the person asked can say no/)
    await rejects(answer(KYLE, cover.id, true), /your own request/)
    await rejects(decide(GLADYS, cover.id, true), /needs someone to cover it/)
    await answer(JOSH, cover.id, true)
    await decide(GLADYS, cover.id, true)
    assert.equal(await owner_(kyles), JOSH)

    // Nobody offered: the approver may pick who covers, but never themselves.
    const kyles2 = await addShift({ date: '2027-04-10', type: 'night', user: KYLE })
    const open = await ask(KYLE, kyles2)
    await rejects(decide(GLADYS, open.id, true, GLADYS), /part of this request/)
    await decide(CARLY, open.id, true, JOSH)
    assert.equal(await owner_(kyles2), JOSH)

    // The person asked can say no; the person who asked can withdraw. Both stay on record.
    const later = await addShift({ date: '2027-04-09', type: 'night', user: JOSH })
    const no = await answer(KYLE, (await ask(JOSH, later, KYLE)).id, false)
    assert.equal(no.status, 'declined')
    assert.equal(no.decided_by, KYLE)
    const again = await ask(JOSH, later)
    await rejects(withdraw(KYLE, again.id), /Only the person who asked/)
    const back = await withdraw(JOSH, again.id)
    assert.equal(back.status, 'withdrawn')
    await rejects(answer(KYLE, again.id, true), /withdrawn/)
    assert.equal(await owner_(later), JOSH)

    // Nothing once the shift has started.
    const t = await startingAgo(5)
    const started = await addShift({ date: t.date, type: 'night', user: JOSH, start: t.start, end: t.end })
    await rejects(ask(JOSH, started, GLADYS), /has started/)

    await rejects(db.query(`delete from swaps where id = $1`, [swap.id]), /never|not allowed|forbid/i)
    await rejects(db.query(`update swaps set reason = 'x' where id = $1`, [no.id]), /already decided/)
  } finally {
    db = shared
  }
})

test('days off: set from tomorrow on, replaced as a whole, only your own', async () => {
  const shared = db
  db = await freshDb()
  try {
    const { today, tomorrow } = await days()
    const plus = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
    const set = (who, dates, note = null) =>
      call(who, `select date::text, note from public.set_days_off($1, $2, $3::date[], $4)`, [tomorrow, plus(14), dates, note])

    assert.deepEqual(await set(JOSH, [tomorrow, plus(3)], ' Uni exam '), [
      { date: tomorrow, note: 'Uni exam' },
      { date: plus(3), note: 'Uni exam' },
    ])
    assert.deepEqual(await set(JOSH, [plus(3)]), [{ date: plus(3), note: null }])
    await rejects(call(JOSH, `select * from public.set_days_off($1, $2, $3::date[])`, [today, plus(14), [today]]), /from tomorrow on/)
    await rejects(call(JOSH, `select * from public.set_days_off($1, $2, $3::date[])`, [tomorrow, plus(60), [tomorrow]]), /within one month/)
    // Kyle's marks are his own; Josh's stay as they were.
    await set(KYLE, [plus(2)])
    assert.deepEqual((await db.query(`select user_id, date::text from availability order by user_id`)).rows, [
      { user_id: JOSH, date: plus(3) },
      { user_id: KYLE, date: plus(2) },
    ])
  } finally {
    db = shared
  }
})

// Supabase loads pg_safeupdate for the app's requests: an UPDATE or DELETE without a WHERE fails there (error
// 21000), even inside a function, though PGlite here would run it. So every function in the database is read
// back and each UPDATE / DELETE statement must have a WHERE. (update_site_location broke live this way.)
test('no database function updates or deletes without a WHERE (Supabase refuses it)', async () => {
  const { rows } = await db.query(
    `select n.nspname || '.' || p.proname as fn, p.prosrc as src
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prolang in (select oid from pg_language where lanname in ('plpgsql', 'sql'))`,
  )
  const missing = []
  for (const { fn, src } of rows) {
    const code = src.replace(/--[^\n]*/g, ' ').replace(/'(?:[^']|'')*'/g, "''")
    for (const statement of code.split(';')) {
      const s = statement.toLowerCase()
      const writes = /(^|[^a-z_])(?<!for\s)(?<!do\s)update\s+(public\.|private\.)?[a-z_]+\s+(?:[a-z_]+\s+)?set\b/.test(s) || /\bdelete\s+from\b/.test(s)
      if (writes && !/\bwhere\b/.test(s)) missing.push(`${fn}: ${statement.trim().split('\n')[0]}`)
    }
  }
  assert.deepEqual(missing, [])
})
