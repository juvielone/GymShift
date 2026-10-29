// In-memory stand-in for the Supabase database. Internal to src/data — never import this from UI code.
// When Supabase is wired in, each src/data module swaps its `db.*` access for a Supabase query
// and its permission checks move into row-level security; function signatures stay the same.
import * as seed from '@/mocks'
import type { Role, User, Uuid } from '@/types'

export const db = {
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
}

/** Return a deep copy so callers can never mutate stored rows. */
export const copy = <T>(value: T): T => structuredClone(value)

export const newId = (prefix: string): Uuid => `${prefix}-${crypto.randomUUID()}`

// Mock server clock: starts at MOCK_NOW and advances in real time, so the seeded scenario
// (28 Oct, Josh's night shift about to start) stays stable whatever day the app is run.
// Supabase will use the database's now(); the phone's clock is never trusted.
let clockBase = Date.parse(seed.MOCK_NOW)
let clockStartedAt = Date.now()

export function serverNow(): string {
  return new Date(clockBase + (Date.now() - clockStartedAt)).toISOString()
}

/** Test/dev helper: jump the mock server clock to a given time. */
export function setMockNow(ts: string): void {
  clockBase = Date.parse(ts)
  clockStartedAt = Date.now()
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
