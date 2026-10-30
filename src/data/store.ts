// In-memory stand-in for the Supabase database. Internal to src/data — never import this from UI code.
// When Supabase is wired in, each src/data module swaps its `db.*` access for a Supabase query
// and its permission checks move into row-level security; function signatures stay the same.
//
// Two modes until then:
// - 'demo' (dev server): the seeded fortnight at a fixed mock time, reset on every reload.
// - 'trial' (production build, or VITE_DATA_MODE=trial): real time from the web server and data saved
//   on this phone, so the app can be tried on a real shift before Supabase exists.
import * as seed from '@/mocks'
import type { Role, User, Uuid } from '@/types'

export type DataMode = 'demo' | 'trial'

export const MODE: DataMode =
  import.meta.env.VITE_DATA_MODE === 'trial' || import.meta.env.VITE_DATA_MODE === 'demo'
    ? import.meta.env.VITE_DATA_MODE
    : import.meta.env.DEV
      ? 'demo'
      : 'trial'

const fresh = () => ({
  roles: structuredClone(seed.roles),
  users: structuredClone(seed.users),
  settings: structuredClone(seed.settings),
  availability: structuredClone(seed.availability),
  shifts: structuredClone(seed.shifts),
  shiftChanges: structuredClone(seed.shiftChanges),
  clockEvents: structuredClone(seed.clockEvents),
  corrections: structuredClone(seed.corrections),
  flags: structuredClone(seed.flags),
  extensions: structuredClone(seed.extensions),
  swaps: structuredClone(seed.swaps),
  photos: structuredClone(seed.photos),
  notes: structuredClone(seed.notes),
})

type Db = ReturnType<typeof fresh>

/** Mock sign-in. Replaced by Supabase auth; kept here so trial mode remembers who is signed in. */
export const auth: { userId: Uuid; signedIn: boolean } = { userId: seed.JOSH, signedIn: false }

// ---- Saved on the phone (trial mode only) ----

const STORAGE_KEY = 'gymshift.trial.v1'

interface Saved {
  db: Db
  auth: typeof auth
}

function load(): Db {
  const base = fresh()
  if (MODE !== 'trial') return base
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<Saved>
    Object.assign(auth, saved.auth)
    // New tables and settings added since the save fall back to the seed, so an older save still loads.
    return { ...base, ...saved.db, settings: { ...base.settings, ...saved.db?.settings } }
  } catch {
    return base
  }
}

export const db: Db = load()

let saveQueued = false

/** Writes the whole store to this phone after a change. Batched so a burst of writes saves once. */
export function persist(): void {
  if (MODE !== 'trial' || saveQueued) return
  saveQueued = true
  queueMicrotask(() => {
    saveQueued = false
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ db, auth } satisfies Saved))
    } catch (e) {
      console.warn('[GymShift] Could not save trial data on this phone', e)
    }
  })
}

/** Trial mode: forget everything saved on this phone and start again from the seed. */
export function clearSaved(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked (private window): nothing was saved anyway.
  }
}

/** Return a deep copy so callers can never mutate stored rows. */
export const copy = <T>(value: T): T => structuredClone(value)

export const newId = (prefix: string): Uuid => `${prefix}-${crypto.randomUUID()}`

// ---- Server clock ----
// The phone's clock is never trusted. Demo mode starts at MOCK_NOW so the seeded scenario stays stable.
// Trial mode reads the time from our own web server's Date header. Both then count forward with
// performance.now(), which changing the phone's clock doesn't move. Supabase will use the DB's now().

let clockBase = MODE === 'demo' ? Date.parse(seed.MOCK_NOW) : NaN
let clockStartedAt = performance.now()
let lastSyncAt = -Infinity

/** A phone that slept may have paused performance.now(), so trial time is re-read after this long. */
const RESYNC_AFTER_MS = 5 * 60_000

export function serverNow(): string {
  if (Number.isNaN(clockBase)) throw new Error('Server time has not been read yet')
  return new Date(clockBase + (performance.now() - clockStartedAt)).toISOString()
}

/**
 * Trial mode: read the time from the web server. The Date header is whole seconds and stamped
 * roughly halfway through the round trip. Throws when offline; demo mode does nothing.
 */
export async function syncServerClock(): Promise<void> {
  if (MODE !== 'trial') return
  const sent = performance.now()
  const res = await fetch(`${location.origin}/`, { method: 'HEAD', cache: 'no-store' })
  const received = performance.now()
  const header = res.headers.get('date')
  const server = header ? Date.parse(header) : NaN
  if (Number.isNaN(server)) throw new Error('The server sent no time')
  clockBase = server + 500 + (received - sent) / 2
  clockStartedAt = received
  lastSyncAt = received
}

/** Before saving a clock event: trial time must be fresh, so a slept phone can't stamp an old time. */
export async function requireFreshClock(): Promise<void> {
  if (MODE !== 'trial') return
  await syncServerClock()
}

if (MODE === 'trial' && typeof document !== 'undefined') {
  const resync = () => {
    if (performance.now() - lastSyncAt > RESYNC_AFTER_MS) void syncServerClock().catch(() => {})
  }
  // Coming back to the app after the phone was locked: re-read the time straight away.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncServerClock().catch(() => {})
  })
  setInterval(resync, 60_000)
}

/** Demo helper: jump the mock server clock to a given time. Trial mode always uses the real time. */
export function setMockNow(ts: string): void {
  if (MODE !== 'demo') return
  clockBase = Date.parse(ts)
  clockStartedAt = performance.now()
}

export function requireUser(id: Uuid): User {
  const user = db.users.find((u) => u.id === id)
  if (!user) throw new Error(`Unknown user ${id}`)
  return user
}

export function roleOf(user: User): Role {
  const role = db.roles.find((r) => r.id === user.role)
  if (!role) throw new Error(`Unknown role ${user.role}`)
  return role
}

/** Manager acts on anyone; team lead on their own group; everyone on themselves. Mirrors planned RLS. */
export function canActOn(actor: User, targetUserId: Uuid, scope: 'all' | 'own_group' | 'own' | false): boolean {
  if (scope === false) return false
  if (actor.id === targetUserId || scope === 'all') return true
  if (scope === 'own_group') return requireUser(targetUserId).team_lead_id === actor.id
  return false
}
