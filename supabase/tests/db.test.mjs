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
    const { today } = await days()
    const fortnight = (await db.query(`select private.fortnight_start_of($1::date)::text as f`, [today])).rows[0].f

    const shift = await createShift(CARLY, today, 'night', JOSH)
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
