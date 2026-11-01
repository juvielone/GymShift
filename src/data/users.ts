import type { Role, RoleId, User, Uuid } from '@/types'
import { CARLY, GLADYS, JOSH } from '@/mocks'
import { auth, copy, db, MODE, newId, requireUser, roleOf, serverNow } from './store'
import { compareTs, localDate } from '@/lib/rules'

// Mock session (held in the store so trial mode remembers it). Replaced by Supabase auth later:
// username + 6-digit PIN for staff, username + password for the manager (PRD F1, 1 Nov 2026).

export async function getCurrentUser(): Promise<User> {
  return copy(requireUser(auth.userId))
}

/** Whether someone is signed in. Demo mode always starts signed out; trial mode remembers. */
export async function isSignedIn(): Promise<boolean> {
  return auth.signedIn
}

export async function signOut(): Promise<void> {
  auth.signedIn = false
}

// Supabase limits repeated sign-in attempts; the mock does the same so the screen handles it.
const MAX_TRIES = 5
const LOCK_MS = 60_000
let failedTries = 0
let lockedUntil = 0

/** One message for an unknown name, a wrong PIN or an inactive account, so names can't be guessed. */
export const SIGN_IN_MISMATCH = "That name and PIN don't match."

export async function signIn(input: { username: string; secret: string }): Promise<User> {
  const now = Date.parse(serverNow())
  if (now < lockedUntil) throw new Error('Too many tries. Wait a minute, then try again.')
  const username = input.username.trim().toLowerCase()
  const user = db.users.find((u) => u.username === username && u.active)
  const ok = user !== undefined && db.credentials.some((c) => c.user_id === user.id && c.secret === input.secret)
  if (!ok) {
    failedTries += 1
    if (failedTries >= MAX_TRIES) {
      failedTries = 0
      lockedUntil = now + LOCK_MS
    }
    throw new Error(SIGN_IN_MISMATCH)
  }
  failedTries = 0
  auth.userId = user.id
  auth.signedIn = true
  return copy(user)
}

export interface DemoAccount {
  username: string
  full_name: string
  role: RoleId
  secret: string
}

/** Mock only: the accounts the sign-in screen offers as one-tap helpers. Removed when real auth arrives. */
export async function getDemoAccounts(): Promise<DemoAccount[]> {
  if (MODE === 'live') return []
  return [CARLY, GLADYS, JOSH].map((id) => {
    const u = requireUser(id)
    return { username: u.username, full_name: u.full_name, role: u.role, secret: db.credentials.find((c) => c.user_id === id)?.secret ?? '' }
  })
}

/** Dev switcher only: become someone without their PIN, to see the app from their role. */
export async function setMockCurrentUser(id: Uuid): Promise<void> {
  requireUser(id)
  auth.userId = id
  auth.signedIn = true
}

export async function getUsers(filter: { role?: RoleId; teamLeadId?: Uuid; activeOnly?: boolean } = {}): Promise<User[]> {
  return copy(
    db.users.filter(
      (u) =>
        (filter.role === undefined || u.role === filter.role) &&
        (filter.teamLeadId === undefined || u.team_lead_id === filter.teamLeadId) &&
        (!filter.activeOnly || u.active),
    ),
  )
}

export async function getUser(id: Uuid): Promise<User | null> {
  return copy(db.users.find((u) => u.id === id) ?? null)
}

export async function getRoles(): Promise<Role[]> {
  return copy(db.roles)
}

/** Permissions of a user's role (UI convenience; RLS is the real enforcement). */
export async function getPermissions(userId: Uuid): Promise<Role> {
  return copy(roleOf(requireUser(userId)))
}

// Staff management: manager only (PRD "Manage users and site settings"). People are never deleted;
// deactivating keeps their hours and records and only drops them from pickers.

/** Roles Carly can give in the app. v1 keeps a single manager, so Manager isn't offered. */
export const ASSIGNABLE_ROLES: RoleId[] = ['cleaner', 'team_lead']

const USERNAME_RE = /^[a-z][a-z0-9]{1,19}$/

/** A first-name username to start from: "Josh Lagos" → "josh". Carly can change it before saving. */
export function suggestUsername(fullName: string): string {
  return fullName.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)
}

/** A random 6-digit PIN, never an easy one (all the same digit, or a straight run like 123456). */
function newPin(): string {
  for (;;) {
    const digits = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b % 10)
    const same = digits.every((d) => d === digits[0])
    const run = digits.every((d, i) => i === 0 || d - digits[i - 1] === 1) || digits.every((d, i) => i === 0 || digits[i - 1] - d === 1)
    if (!same && !run) return digits.join('')
  }
}

function setSecret(userId: Uuid, secret: string): void {
  const row = db.credentials.find((c) => c.user_id === userId)
  if (row) row.secret = secret
  else db.credentials.push({ user_id: userId, secret })
}

function requireManager(actorId: Uuid): User {
  const actor = requireUser(actorId)
  if (!roleOf(actor).can_manage_users) throw new Error('Only the manager can manage staff')
  return actor
}

type Details = { full_name: string; username: string; role: RoleId; team_lead_id: Uuid | null }

function checkDetails(input: Details, selfId?: Uuid): void {
  if (!input.full_name.trim()) throw new Error('Add their name')
  const username = input.username.trim().toLowerCase()
  if (!USERNAME_RE.test(username)) throw new Error('Use a username of 2 to 20 letters or numbers, starting with a letter')
  const taken = db.users.find((u) => u.id !== selfId && u.username === username)
  if (taken) throw new Error(`${taken.full_name} already uses that username`)
  if (!ASSIGNABLE_ROLES.includes(input.role)) throw new Error('Choose Cleaner or Team lead')
  if (input.team_lead_id !== null) {
    const lead = requireUser(input.team_lead_id)
    if (lead.role !== 'team_lead' || !lead.active || lead.id === selfId) throw new Error('Choose an active team lead')
  }
}

/** A team lead who stops leading (new role or deactivated) hands their group to the manager. */
function releaseGroup(leadId: Uuid): void {
  for (const u of db.users) if (u.team_lead_id === leadId) u.team_lead_id = null
}

/** Adds the person with a new PIN. The PIN is returned once, for Carly to pass on, and never again. */
export async function createUser(input: { actorId: Uuid } & Details): Promise<{ user: User; pin: string }> {
  requireManager(input.actorId)
  const team_lead_id = input.role === 'cleaner' ? input.team_lead_id : null
  checkDetails({ ...input, team_lead_id })
  const row: User = {
    id: newId('user'),
    full_name: input.full_name.trim(),
    username: input.username.trim().toLowerCase(),
    email: null,
    role: input.role,
    team_lead_id,
    active: true,
    created_at: serverNow(),
  }
  db.users.push(row)
  const pin = newPin()
  setSecret(row.id, pin)
  return { user: copy(row), pin }
}

export async function updateUser(input: { actorId: Uuid; userId: Uuid; patch: Details }): Promise<User> {
  const actor = requireManager(input.actorId)
  const user = requireUser(input.userId)
  if (user.id === actor.id || user.role === 'manager') throw new Error("The manager's own account can't be changed here")
  const team_lead_id = input.patch.role === 'cleaner' ? input.patch.team_lead_id : null
  checkDetails({ ...input.patch, team_lead_id }, user.id)
  if (user.role === 'team_lead' && input.patch.role !== 'team_lead') releaseGroup(user.id)
  Object.assign(user, { full_name: input.patch.full_name.trim(), username: input.patch.username.trim().toLowerCase(), role: input.patch.role, team_lead_id })
  return copy(user)
}

/** Manager only. The old PIN stops working; the new one is returned once, for Carly to pass on. */
export async function resetPin(input: { actorId: Uuid; userId: Uuid }): Promise<{ pin: string }> {
  const actor = requireManager(input.actorId)
  const user = requireUser(input.userId)
  if (user.id === actor.id || user.role === 'manager') throw new Error("The manager signs in with a password, not a PIN")
  if (!user.active) throw new Error('Reactivate them first')
  const pin = newPin()
  setSecret(user.id, pin)
  return { pin }
}

export async function setUserActive(input: { actorId: Uuid; userId: Uuid; active: boolean }): Promise<User> {
  const actor = requireManager(input.actorId)
  const user = requireUser(input.userId)
  if (user.id === actor.id || user.role === 'manager') throw new Error("The manager's own account can't be deactivated")
  if (!input.active && user.role === 'team_lead') releaseGroup(user.id)
  // A cleaner coming back whose team lead has since gone reports to the manager.
  if (input.active && user.team_lead_id && !requireUser(user.team_lead_id).active) user.team_lead_id = null
  user.active = input.active
  return copy(user)
}

export interface StaffImpact {
  /** Published shifts from today on that are assigned to them. */
  upcomingShifts: number
  /** Their latest clock event is a clock-in. */
  clockedIn: boolean
  /** Active people whose team lead they are. */
  group: User[]
}

/** What changes for others if this person is deactivated or stops being a team lead. */
export async function getStaffImpact(userId: Uuid): Promise<StaffImpact> {
  const today = localDate(serverNow(), db.settings)
  const events = db.clockEvents.filter((e) => e.user_id === userId).sort((a, b) => compareTs(a.server_time, b.server_time))
  return copy({
    upcomingShifts: db.shifts.filter((s) => s.assigned_user_id === userId && s.status === 'published' && s.date >= today).length,
    clockedIn: events.at(-1)?.kind === 'in',
    group: db.users.filter((u) => u.team_lead_id === userId && u.active),
  })
}
