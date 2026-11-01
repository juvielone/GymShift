// Live mode: Supabase. Internal to src/data, and loaded only in live mode (index.ts imports it lazily).
// Sign-in is Supabase auth with the hidden login address <username>@staff.gymshift.invalid (PRD F1).
// Reads: refresh() loads everything row-level security lets this person see into the store, so the
// read functions in the other modules work unchanged. Writes: database functions (RPC), then refresh().
// Writes without a database function yet are refused in index.ts with NOT_LIVE_YET.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Availability, ClockEvent, Correction, DateString, Extension, Flag, Note, NoteTag, Photo, Role, Scope, Shift, ShiftChange, ShiftType, SiteSettings, Swap, TimeString, Timestamp, User, Uuid } from '@/types'
import type { ClockLocation, ClockResult } from './clockEvents'
import { requireCanAddPhoto } from './photos'
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
const toShift = (s: Shift): Shift => ({ ...s, start_time: hhmm(s.start_time), end_time: hhmm(s.end_time) })

/**
 * A database function's error, in words for the screen. Its own messages (P0001, and 42501 for "not allowed")
 * are written for the person. The raw error goes to the console for whoever is setting the database up.
 */
function saveError(error: { code?: string; message: string }): Error {
  console.warn('[GymShift] Supabase write failed', error)
  // PostgREST: no such function, so a migration hasn't been applied to this project yet.
  if (error.code === 'PGRST202') return new Error("This isn't set up in the database yet (a migration is missing).")
  // Postgres' own "permission denied for function …": the session has run out.
  if (error.code === '42501' && error.message.startsWith('permission denied')) return new Error('Sign in again, then try once more.')
  if (error.code === 'P0001' || error.code === '42501') return new Error(error.message)
  return new Error('Not saved yet. Check your internet and try again.')
}

async function rows<T>(table: string): Promise<T[]> {
  const { data, error } = await sb().from(table).select('*')
  if (error) throw new Error(`Couldn't load ${table}: ${error.message}`)
  return data as T[]
}

let refreshesStarted = 0
let refreshApplied = 0

/** Reload everything this person may see. Small on purpose: about 7 people and a few fortnights. */
async function refresh(): Promise<void> {
  const started = ++refreshesStarted
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
  // A slower, older reload (a background one overtaken by a save) must not put back what it read.
  if (started < refreshApplied) return
  refreshApplied = started
  const site = settings[0]
  Object.assign(db, {
    roles: roles.map((r) => ({ ...r, can_publish_roster: r.can_publish_roster ?? false, can_approve_swaps: r.can_approve_swaps ?? false })),
    users,
    settings: site ? { ...site, default_morning_start: hhmm(site.default_morning_start), default_night_start: hhmm(site.default_night_start) } : db.settings,
    availability,
    shifts: shifts.map(toShift),
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

let pulling: Promise<void> | null = null

/** Background reload, for screens that keep up with other people (Carly's Today, notes, the roster). One at a time. */
export function pull(): Promise<void> {
  if (!auth.signedIn) return Promise.resolve()
  pulling ??= refresh().finally(() => {
    pulling = null
  })
  return pulling
}

function clear(): void {
  photoLinks.clear()
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

// ---- Site settings (database function public.update_site_location) ----

export async function updateSiteLocation(input: { userId: Uuid; lat: number; lng: number; radius_m: number }): Promise<SiteSettings> {
  if (input.userId !== auth.userId) throw new Error('Only the manager can change site settings')
  const { error } = await sb().rpc('update_site_location', { p_lat: input.lat, p_lng: input.lng, p_radius_m: input.radius_m })
  if (error) throw saveError(error)
  await refresh().catch(() => {})
  return copy(db.settings)
}

// ---- Roster (database functions create_shift, update_shift, remove_shift, copy_fortnight, publish_fortnight) ----

/** The database rosters as whoever is signed in; this only guards against a screen passing someone else. */
function requireMe(userId: Uuid): void {
  if (userId !== auth.userId) throw new Error('Not allowed to roster this shift')
}

/** Calls a database function that writes, then reloads. Saved by then: if the reload fails the screen shows the last view until the next one. */
async function write<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args)
  if (error) throw saveError(error)
  await refresh().catch(() => {})
  return data as T
}

export async function createShift(input: {
  date: DateString
  type: ShiftType
  assignedUserId: Uuid
  createdBy: Uuid
  start_time?: TimeString
  end_time?: TimeString
}): Promise<Shift> {
  requireMe(input.createdBy)
  return toShift(
    await write<Shift>('create_shift', {
      p_date: input.date,
      p_type: input.type,
      p_assigned_user_id: input.assignedUserId,
      p_start_time: input.start_time ?? null,
      p_end_time: input.end_time ?? null,
    }),
  )
}

export async function updateShift(input: {
  shiftId: Uuid
  changedBy: Uuid
  patch: Partial<Pick<Shift, 'date' | 'type' | 'start_time' | 'end_time' | 'assigned_user_id'>>
}): Promise<Shift> {
  requireMe(input.changedBy)
  const { patch } = input
  return toShift(
    await write<Shift>('update_shift', {
      p_shift_id: input.shiftId,
      p_date: patch.date ?? null,
      p_type: patch.type ?? null,
      p_start_time: patch.start_time ?? null,
      p_end_time: patch.end_time ?? null,
      p_assigned_user_id: patch.assigned_user_id ?? null,
    }),
  )
}

export async function removeShift(input: { shiftId: Uuid; removedBy: Uuid }): Promise<{ removed: 'deleted' | 'cancelled' }> {
  requireMe(input.removedBy)
  return { removed: await write<'deleted' | 'cancelled'>('remove_shift', { p_shift_id: input.shiftId }) }
}

export async function copyFortnight(input: { fromStart: DateString; toStart: DateString; createdBy: Uuid }): Promise<Shift[]> {
  requireMe(input.createdBy)
  return (await write<Shift[]>('copy_fortnight', { p_from_start: input.fromStart, p_to_start: input.toStart })).map(toShift)
}

export async function publishFortnight(input: { fortnightStart: DateString; publishedBy: Uuid }): Promise<Shift[]> {
  requireMe(input.publishedBy)
  return (await write<Shift[]>('publish_fortnight', { p_fortnight_start: input.fortnightStart })).map(toShift)
}

// ---- Notes (database functions add_note, mark_note_done) ----

export async function addNote(input: { shiftId: Uuid; userId: Uuid; body: string; tag?: NoteTag; arriveBy?: Timestamp }): Promise<Note> {
  if (input.userId !== auth.userId) throw new Error('Notes can only be added to your own shift')
  return write<Note>('add_note', { p_shift_id: input.shiftId, p_body: input.body, p_tag: input.tag ?? null, p_arrive_by: input.arriveBy ?? null })
}

export async function markNoteDone(input: { noteId: Uuid; doneBy: Uuid }): Promise<Note> {
  if (input.doneBy !== auth.userId) throw new Error('Only the manager can mark notes done')
  return write<Note>('mark_note_done', { p_note_id: input.noteId })
}

// ---- Flags (database function resolve_flag; raising them happens inside clock_in/out and the scheduled job) ----

export async function resolveFlag(input: { flagId: Uuid; resolvedBy: Uuid }): Promise<Flag> {
  if (input.resolvedBy !== auth.userId) throw new Error('Only the manager can resolve flags')
  return write<Flag>('resolve_flag', { p_flag_id: input.flagId })
}

// ---- Photos (private Storage bucket shift-photos; database functions add_photo, remove_photo) ----

const PHOTO_BUCKET = 'shift-photos'
/** Signed links last an hour; one is reused while it has at least 5 minutes left. */
const LINK_SECONDS = 3600
const photoLinks = new Map<string, { url: string; until: number }>()

/** Upload the image into the person's own folder, then save the row. A refused save takes the image back out. */
export async function uploadPhoto(input: { shiftId: Uuid; userId: Uuid; file: Blob }): Promise<Photo> {
  if (input.userId !== auth.userId) throw new Error('Photos can only be added to your own shift')
  requireCanAddPhoto(input)
  const path = `${input.userId}/${input.shiftId}/${crypto.randomUUID()}.jpg`
  const bucket = sb().storage.from(PHOTO_BUCKET)
  const { error } = await bucket.upload(path, input.file, { contentType: 'image/jpeg', upsert: false })
  if (error) {
    console.warn('[GymShift] Photo upload failed', error)
    throw new Error('Not saved yet. Check your internet and try again.')
  }
  try {
    return await write<Photo>('add_photo', { p_shift_id: input.shiftId, p_storage_path: path })
  } catch (e) {
    // Storage only lets this go while the image has no row, so a save that did land is never undone.
    void bucket.remove([path])
    throw e
  }
}

/** A short-lived signed link to the image. null = removed, or not allowed to see it. */
export async function photoUrl(photo: Photo): Promise<string | null> {
  if (photo.removed_at !== null) return null
  const cached = photoLinks.get(photo.storage_path)
  if (cached && cached.until - performance.now() > 5 * 60_000) return cached.url
  const { data, error } = await sb().storage.from(PHOTO_BUCKET).createSignedUrl(photo.storage_path, LINK_SECONDS)
  if (error || !data) return null
  photoLinks.set(photo.storage_path, { url: data.signedUrl, until: performance.now() + LINK_SECONDS * 1000 })
  return data.signedUrl
}

/** Marks the row removed (it stays, with who and when), then deletes the image. */
export async function removePhoto(input: { photoId: Uuid; userId: Uuid }): Promise<Photo> {
  if (input.userId !== auth.userId) throw new Error('Only the manager can remove this photo')
  const photo = await write<Photo>('remove_photo', { p_photo_id: input.photoId })
  photoLinks.delete(photo.storage_path)
  // If this fails the image stays in Storage, but nobody can open it: a removed photo gets no link.
  const { error } = await sb().storage.from(PHOTO_BUCKET).remove([photo.storage_path])
  if (error) console.warn('[GymShift] Removed photo image not deleted', error)
  return photo
}
