// Live mode: Supabase. Internal to src/data, and loaded only in live mode (index.ts imports it lazily).
// Sign-in is Supabase auth with the hidden login address <username>@staff.gymshift.invalid (PRD F1).
// Reads: refresh() loads everything row-level security lets this person see into the store, so the
// read functions in the other modules work unchanged. Writes: database functions (RPC), then refresh().
// Writes without a database function yet are refused in index.ts with NOT_LIVE_YET.
import { createClient, FunctionsFetchError, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import type {
  Availability,
  ClockEvent,
  ClockVoid,
  Correction,
  CorrectionReason,
  CorrectionRequest,
  DateString,
  Extension,
  Flag,
  Note,
  NoteTag,
  Photo,
  Role,
  Scope,
  Shift,
  ShiftChange,
  ShiftInstruction,
  ShiftInstructionRead,
  ShiftType,
  SiteSettings,
  Swap,
  TimeString,
  Timestamp,
  User,
  UserContact,
  Uuid,
} from '@/types'
import { AlreadyClockedInError, type ClockLocation, type ClockResult } from './clockEvents'
import { requireCanAddPhoto } from './photos'
import { SIGN_IN_MISMATCH } from './users'
import { getShiftNotes, type ShiftNote } from './shiftInstructions'
import { auth, copy, db, emptyTables, requireUser, syncTeamNames } from './store'

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
  // Only a request that never reached the server is a connection problem (no Postgres code). Anything else
  // is the database refusing, and "check your internet" would send people looking in the wrong place.
  if (!error.code || /fetch|network|load failed/i.test(error.message)) return new Error('Not saved yet. Check your internet and try again.')
  // The code lets whoever looks after the app match a screenshot to the console warning above.
  return new Error(`Not saved yet. Try again. (Code ${error.code})`)
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
  const [roles, users, userContacts, settings, availability, shifts, shiftChanges, clockEvents, corrections, clockVoids, correctionRequests, flags, extensions, swaps, photos, notes, shiftInstructions, shiftInstructionReads] =
    await Promise.all([
    rows<RoleRow>('roles'),
    rows<User>('users'),
    rows<UserContact>('user_contacts'),
    rows<SiteSettings>('site_settings'),
    rows<Availability>('availability'),
    rows<Shift>('shifts'),
    rows<ShiftChange>('shift_changes'),
    rows<ClockEvent>('clock_events'),
    rows<Correction>('corrections'),
    rows<ClockVoid>('clock_voids'),
    rows<CorrectionRequest>('correction_requests'),
    rows<Flag>('flags'),
    rows<Extension>('extensions'),
    rows<Swap>('swaps'),
    rows<Photo>('photos'),
    rows<Note>('notes'),
    rows<ShiftInstruction>('shift_instructions'),
    rows<ShiftInstructionRead>('shift_instruction_reads'),
  ])
  // A slower, older reload (a background one overtaken by a save) must not put back what it read.
  if (started < refreshApplied) return
  refreshApplied = started
  const site = settings[0]
  Object.assign(db, {
    roles: roles.map((r) => ({ ...r, can_publish_roster: r.can_publish_roster ?? false, can_approve_swaps: r.can_approve_swaps ?? false })),
    users,
    userContacts,
    settings: site ? { ...site, default_morning_start: hhmm(site.default_morning_start), default_night_start: hhmm(site.default_night_start) } : db.settings,
    availability,
    shifts: shifts.map(toShift),
    shiftChanges,
    clockEvents,
    corrections,
    clockVoids,
    correctionRequests,
    flags,
    extensions,
    swaps,
    photos,
    notes,
    shiftInstructions,
    shiftInstructionReads,
  })
  syncTeamNames()
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
  syncTeamNames()
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

// ---- Staff (database functions update_staff, set_staff_active; Edge Function `staff` for sign-ins) ----

type StaffDetails = { full_name: string; username: string; role: User['role']; team_lead_id: Uuid | null; phone: string | null }

const staffArgs = (d: StaffDetails) => ({ full_name: d.full_name, username: d.username, role: d.role, team_lead_id: d.role === 'cleaner' ? d.team_lead_id : null, phone: d.phone })

/** The Edge Function that makes logins and sets PINs (supabase/functions/staff), then a reload. */
async function staffFunction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().functions.invoke('staff', { body })
  if (error) {
    console.warn('[GymShift] Staff function failed', error)
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response
      // Not deployed to this project yet.
      if (res.status === 404) throw new Error("This isn't set up in the database yet (the staff function isn't deployed).")
      const message = await res
        .json()
        .then((b: { error?: string }) => b.error)
        .catch(() => undefined)
      throw new Error(message ?? 'Not saved yet. Try again.')
    }
    if (error instanceof FunctionsFetchError) throw new Error('Not saved yet. Check your internet and try again.')
    throw new Error('Not saved yet. Try again.')
  }
  await refresh().catch(() => {})
  return data as T
}

function requireManagerSelf(actorId: Uuid): void {
  if (actorId !== auth.userId) throw new Error('Only the manager can manage staff')
}

export async function createUser(input: { actorId: Uuid; pin?: string } & StaffDetails): Promise<{ user: User; pin: string }> {
  requireManagerSelf(input.actorId)
  const { user, pin } = await staffFunction<{ user: User; pin: string }>({ action: 'create', ...staffArgs(input), pin: input.pin ?? null })
  return { user: copy(db.users.find((u) => u.id === user.id) ?? user), pin }
}

/** A new username renames the login too, so it goes through the Edge Function; anything else is a database function. */
export async function updateUser(input: { actorId: Uuid; userId: Uuid; patch: StaffDetails }): Promise<User> {
  requireManagerSelf(input.actorId)
  const renamed = input.patch.username.trim().toLowerCase() !== requireUser(input.userId).username
  if (renamed) await staffFunction({ action: 'rename', user_id: input.userId, ...staffArgs(input.patch) })
  else {
    const args = staffArgs(input.patch)
    await write('update_staff', {
      p_user_id: input.userId,
      p_full_name: args.full_name,
      p_username: args.username,
      p_role: args.role,
      p_team_lead_id: args.team_lead_id,
      p_phone: args.phone,
    })
  }
  return copy(requireUser(input.userId))
}

export async function resetPin(input: { actorId: Uuid; userId: Uuid; pin?: string }): Promise<{ pin: string }> {
  requireManagerSelf(input.actorId)
  return staffFunction<{ pin: string }>({ action: 'reset_pin', user_id: input.userId, pin: input.pin ?? null })
}

export async function setUserActive(input: { actorId: Uuid; userId: Uuid; active: boolean }): Promise<User> {
  requireManagerSelf(input.actorId)
  await write('set_staff_active', { p_user_id: input.userId, p_active: input.active })
  return copy(requireUser(input.userId))
}

// ---- Clock in / out (database functions public.clock_in / public.clock_out) ----

/** Where the phone is, as the clock functions take it. */
const locationArgs = (location: ClockLocation) =>
  'status' in location
    ? { p_location_status: location.status }
    : { p_location_status: 'ok', p_lat: location.lat, p_lng: location.lng, p_accuracy_m: location.accuracy_m }

async function clock(kind: 'in' | 'out', userId: Uuid, location: ClockLocation): Promise<ClockResult> {
  // The database clocks in whoever is signed in; this only guards against a screen passing someone else.
  if (userId !== auth.userId) throw new Error('You can only clock yourself in or out')
  const { data, error } = await sb().rpc(`clock_${kind}`, locationArgs(location))
  if (error) {
    // clock_in() refuses a second open clock-in; details carries when the open one started.
    if (error.code === 'GS409') throw new AlreadyClockedInError(error.details, error.message)
    throw new Error(error.message === 'Sign in first' ? 'Sign in again, then try once more.' : 'Not saved yet. Check your internet and try again.')
  }
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

// ---- Notes for the shift (database functions add_shift_instruction, mark_shift_instruction_seen, withdraw_shift_instruction) ----

/** The saved note as the store now has it, after the reload. */
async function shiftNote(id: Uuid): Promise<ShiftNote> {
  const note = db.shiftInstructions.find((n) => n.id === id)
  if (!note) throw new Error('Saved. Pull down to refresh.')
  return (await getShiftNotes({ viewerId: auth.userId, shiftIds: [note.shift_id], includeWithdrawn: true })).find((n) => n.id === id) ?? { ...copy(note), seen_at: null }
}

export async function addShiftNote(input: { shiftId: Uuid; authorId: Uuid; body: string }): Promise<ShiftNote> {
  if (input.authorId !== auth.userId) throw new Error('Only Carly or their team lead can leave a note for this shift')
  const row = await write<ShiftInstruction>('add_shift_instruction', { p_shift_id: input.shiftId, p_body: input.body })
  return shiftNote(row.id)
}

export async function markShiftNoteSeen(input: { noteId: Uuid; userId: Uuid }): Promise<ShiftNote> {
  if (input.userId !== auth.userId) throw new Error('This note is for someone else')
  await write<ShiftInstructionRead>('mark_shift_instruction_seen', { p_instruction_id: input.noteId })
  return shiftNote(input.noteId)
}

export async function withdrawShiftNote(input: { noteId: Uuid; userId: Uuid }): Promise<ShiftNote> {
  if (input.userId !== auth.userId) throw new Error('Only whoever wrote it, or Carly, can take this note back')
  await write<ShiftInstruction>('withdraw_shift_instruction', { p_instruction_id: input.noteId })
  return shiftNote(input.noteId)
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

// ---- Fixing attendance (database functions request_void, request_end_time, decide_correction_request,
// void_clock_in, correct_clock_time; request_extension, decide_extension) ----

export async function requestVoid(input: {
  clockEventId: Uuid
  userId: Uuid
  reasonCode: CorrectionReason
  note?: string
  location?: ClockLocation
}): Promise<{ request: CorrectionRequest; clockOut: ClockResult | null }> {
  if (input.userId !== auth.userId) throw new Error('You can only ask about your own clock-in')
  const result = await write<{ request: CorrectionRequest; clock_out: ClockResult | null }>('request_void', {
    p_clock_event_id: input.clockEventId,
    p_reason_code: input.reasonCode,
    p_note: input.note ?? null,
    ...(input.location ? locationArgs(input.location) : {}),
  })
  return { request: result.request, clockOut: result.clock_out }
}

export async function requestEndTime(input: {
  clockEventId: Uuid
  userId: Uuid
  reasonCode: CorrectionReason
  requestedTime?: Timestamp
  note?: string
}): Promise<CorrectionRequest> {
  if (input.userId !== auth.userId) throw new Error('You can only ask about your own clock-out')
  return write<CorrectionRequest>('request_end_time', {
    p_clock_event_id: input.clockEventId,
    p_reason_code: input.reasonCode,
    p_requested_time: input.requestedTime ?? null,
    p_note: input.note ?? null,
  })
}

export async function decideCorrectionRequest(input: { requestId: Uuid; decidedBy: Uuid; approve: boolean }): Promise<CorrectionRequest> {
  if (input.decidedBy !== auth.userId) throw new Error('Only the manager can decide corrections')
  return write<CorrectionRequest>('decide_correction_request', { p_request_id: input.requestId, p_approve: input.approve })
}

export async function voidClockIn(input: { clockEventId: Uuid; voidedBy: Uuid; reason: string }): Promise<ClockVoid> {
  if (input.voidedBy !== auth.userId) throw new Error('Only the manager can void a clock-in')
  return write<ClockVoid>('void_clock_in', { p_clock_event_id: input.clockEventId, p_reason: input.reason })
}

export async function addCorrection(input: { clockEventId: Uuid; newTime: Timestamp; reason: string; correctedBy: Uuid }): Promise<Correction> {
  if (input.correctedBy !== auth.userId) throw new Error('Only the manager can correct attendance')
  return write<Correction>('correct_clock_time', { p_clock_event_id: input.clockEventId, p_new_time: input.newTime, p_reason: input.reason })
}

export async function requestExtension(input: { shiftId: Uuid; requestedBy: Uuid; minutes: number; reason: string }): Promise<Extension> {
  if (input.requestedBy !== auth.userId) throw new Error('Only the assigned cleaner can request an extension')
  return write<Extension>('request_extension', { p_shift_id: input.shiftId, p_minutes: input.minutes, p_reason: input.reason })
}

export async function decideExtension(input: { extensionId: Uuid; decidedBy: Uuid; approve: boolean }): Promise<Extension> {
  if (input.decidedBy !== auth.userId) throw new Error('Only the manager can approve extensions')
  return write<Extension>('decide_extension', { p_extension_id: input.extensionId, p_approve: input.approve })
}

// ---- Swaps, covers and days off (database functions request_swap, answer_swap, withdraw_swap, decide_swap, set_days_off) ----

export async function requestSwap(input: { shiftId: Uuid; requestedBy: Uuid; targetUserId?: Uuid | null; reason?: string | null }): Promise<Swap> {
  if (input.requestedBy !== auth.userId) throw new Error('Only the person on this shift can ask')
  return write<Swap>('request_swap', { p_shift_id: input.shiftId, p_target_user_id: input.targetUserId ?? null, p_reason: input.reason ?? null })
}

export async function answerSwap(input: { swapId: Uuid; userId: Uuid; yes: boolean }): Promise<Swap> {
  if (input.userId !== auth.userId) throw new Error('This request is for someone else')
  return write<Swap>('answer_swap', { p_swap_id: input.swapId, p_yes: input.yes })
}

export async function withdrawSwap(input: { swapId: Uuid; userId: Uuid }): Promise<Swap> {
  if (input.userId !== auth.userId) throw new Error('Only the person who asked can withdraw it')
  return write<Swap>('withdraw_swap', { p_swap_id: input.swapId })
}

export async function decideSwap(input: { swapId: Uuid; decidedBy: Uuid; approve: boolean; coveredBy?: Uuid }): Promise<Swap> {
  if (input.decidedBy !== auth.userId) throw new Error('Not allowed to decide this swap')
  return write<Swap>('decide_swap', { p_swap_id: input.swapId, p_approve: input.approve, p_covered_by: input.coveredBy ?? null })
}

export async function setDaysOff(input: { userId: Uuid; from: DateString; to: DateString; dates: DateString[]; note?: string | null }): Promise<Availability[]> {
  if (input.userId !== auth.userId) throw new Error('Sign in first')
  return write<Availability[]>('set_days_off', { p_from: input.from, p_to: input.to, p_dates: input.dates, p_note: input.note ?? null })
}
