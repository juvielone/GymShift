// Live mode: Supabase. Internal to src/data, and loaded only in live mode (index.ts imports it lazily).
// Sign-in is Supabase auth with the hidden login address <username>@staff.gymshift.invalid (PRD F1).
// Reads: refresh() loads everything row-level security lets this person see into the store, so the
// read functions in the other modules work unchanged. Writes: database functions (RPC), then refresh().
// Writes without a database function yet are refused in index.ts with NOT_LIVE_YET.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Availability, ClockEvent, Correction, Extension, Flag, Note, Photo, Role, Scope, Shift, ShiftChange, SiteSettings, Swap, User, Uuid } from '@/types'
import type { ClockLocation, ClockResult } from './clockEvents'
import { SIGN_IN_MISMATCH } from './users'
import { auth, copy, db, emptyTables, requireUser } from './store'

const LOGIN_DOMAIN = 'staff.gymshift.invalid'
const USERNAME_RE = /^[a-z][a-z0-9]{1,19}$/

let client: SupabaseClient | null = null

function sb(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) throw new Error('Live mode needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local')
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  }
  return client
}

// ---- Rows as Postgres returns them, and the small differences from src/types ----

/** "Cannot" is null in the database and false in src/types. */
type RoleRow = Omit<Role, 'can_publish_roster' | 'can_approve_swaps'> & {
  can_publish_roster: Exclude<Scope, 'own'> | null
  can_approve_swaps: Exclude<Scope, 'own'> | null
}

/** Postgres time is "19:00:00"; TimeString is "19:00". */
const hhmm = (t: string) => t.slice(0, 5)

async function rows<T>(table: string): Promise<T[]> {
  const { data, error } = await sb().from(table).select('*')
  if (error) throw new Error(`Couldn't load ${table}: ${error.message}`)
  return data as T[]
}

/** Reload everything this person may see. Small on purpose: about 7 people and a few fortnights. */
async function refresh(): Promise<void> {
  const [roles, users, settings, availability, shifts, shiftChanges, clockEvents, corrections, flags, extensions, swaps, photos, notes] = await Promise.all([
    rows<RoleRow>('roles'),
    rows<User>('users'),
    rows<SiteSettings>('site_settings'),
    rows<Availability>('availability'),
    rows<Shift>('shifts'),
    rows<ShiftChange>('shift_changes'),
    rows<ClockEvent>('clock_events'),
    rows<Correction>('corrections'),
    rows<Flag>('flags'),
    rows<Extension>('extensions'),
    rows<Swap>('swaps'),
    rows<Photo>('photos'),
    rows<Note>('notes'),
  ])
  const site = settings[0]
  Object.assign(db, {
    roles: roles.map((r) => ({ ...r, can_publish_roster: r.can_publish_roster ?? false, can_approve_swaps: r.can_approve_swaps ?? false })),
    users,
    settings: site ? { ...site, default_morning_start: hhmm(site.default_morning_start), default_night_start: hhmm(site.default_night_start) } : db.settings,
    availability,
    shifts: shifts.map((s) => ({ ...s, start_time: hhmm(s.start_time), end_time: hhmm(s.end_time) })),
    shiftChanges,
    clockEvents,
    corrections,
    flags,
    extensions,
    swaps,
    photos,
    notes,
  })
}

function clear(): void {
  Object.assign(db, emptyTables())
  auth.signedIn = false
}

/** Signed in and an active member of staff: load their view. Anyone else is signed straight back out. */
async function enter(userId: Uuid): Promise<boolean> {
  await refresh()
  if (!db.users.some((u) => u.id === userId && u.active)) {
    await sb().auth.signOut()
    clear()
    return false
  }
  auth.userId = userId
  auth.signedIn = true
  return true
}

/** On app start: pick up the session this phone already has (people stay signed in). */
export async function start(): Promise<void> {
  const { data } = await sb().auth.getSession()
  if (data.session) await enter(data.session.user.id)
  else clear()
}

export async function signIn(input: { username: string; secret: string }): Promise<User> {
  const username = input.username.trim().toLowerCase()
  if (!USERNAME_RE.test(username)) throw new Error(SIGN_IN_MISMATCH)
  const { data, error } = await sb().auth.signInWithPassword({ email: `${username}@${LOGIN_DOMAIN}`, password: input.secret })
  if (error) {
    if (error.status === 429) throw new Error('Too many tries. Wait a minute, then try again.')
    if (error.status === 400) throw new Error(SIGN_IN_MISMATCH)
    throw new Error('Not signed in yet. Check your internet and try again.')
  }
  if (!(await enter(data.user.id))) throw new Error('This account is not active. Ask Carly.')
  return copy(requireUser(data.user.id))
}

export async function signOut(): Promise<void> {
  await sb().auth.signOut()
  clear()
}

// ---- Clock in / out (database functions public.clock_in / public.clock_out) ----

async function clock(kind: 'in' | 'out', userId: Uuid, location: ClockLocation): Promise<ClockResult> {
  // The database clocks in whoever is signed in; this only guards against a screen passing someone else.
  if (userId !== auth.userId) throw new Error('You can only clock yourself in or out')
  const args =
    'status' in location
      ? { p_location_status: location.status }
      : { p_location_status: 'ok', p_lat: location.lat, p_lng: location.lng, p_accuracy_m: location.accuracy_m }
  const { data, error } = await sb().rpc(`clock_${kind}`, args)
  if (error) throw new Error(error.message === 'Sign in first' ? 'Sign in again, then try once more.' : 'Not saved yet. Check your internet and try again.')
  // Saved by now. If the reload fails the screen shows the last view until the next one.
  await refresh().catch(() => {})
  return data as ClockResult
}

export const clockIn = (userId: Uuid, location: ClockLocation) => clock('in', userId, location)
export const clockOut = (userId: Uuid, location: ClockLocation) => clock('out', userId, location)
