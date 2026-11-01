// Database rules, tested against real Postgres (PGlite, in memory) with every migration applied.
// Run: npm run test:db
// A small stand-in for Supabase's auth schema (auth.users, auth.uid(), the anon/authenticated roles)
// is created first; it is test-only and never part of the migrations.
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
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
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

const clock = (who, kind, loc) =>
  as(who, async (tx) => (await tx.query(`select public.clock_${kind}($1, $2, $3, $4) as r`, [loc.status ?? 'ok', loc.lat ?? null, loc.lng ?? null, loc.accuracy ?? null])).rows[0].r)

before(async () => {
  db = new PGlite()
  await db.exec(AUTH_STUB)
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'))
  }
  await db.exec(SEED)
})

test('clock-in at the gym links to today’s shift, with the server’s time and no flags', async () => {
  const { today } = await days()
  const shift = await addShift({ date: today, type: 'night', user: JOSH })
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
  assert.equal(r.flags.length, 1)
  assert.equal(r.flags[0].kind, 'off_site')
  assert.match(r.flags[0].detail, /^Clock-out \d+ m from gym \(±20 m\)$/)
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
