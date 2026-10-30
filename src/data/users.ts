import type { Role, RoleId, User, Uuid } from '@/types'
import { CARLY, GLADYS, JOSH } from '@/mocks'
import { auth, copy, db, newId, requireUser, roleOf, serverNow } from './store'
import { compareTs, localDate } from '@/lib/rules'

// Mock session (held in the store so trial mode remembers it). Replaced by Supabase auth (magic link / password) later.
// Starts as Josh so the seeded scenario (his night shift about to start) opens on the cleaner home.

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

/** Demo login: one account per role (manager, team lead, cleaner). Removed when real auth arrives. */
export async function getDemoAccounts(): Promise<User[]> {
  return copy([CARLY, GLADYS, JOSH].map(requireUser))
}

/** Mock sign-in, used by the demo login and the dev switcher to see the app from a user's role. */
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function requireManager(actorId: Uuid): User {
  const actor = requireUser(actorId)
  if (!roleOf(actor).can_manage_users) throw new Error('Only the manager can manage staff')
  return actor
}

function checkDetails(input: { full_name: string; email: string; role: RoleId; team_lead_id: Uuid | null }, selfId?: Uuid) {
  if (!input.full_name.trim()) throw new Error('Add their name')
  const email = input.email.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) throw new Error('Check the email address')
  const taken = db.users.find((u) => u.id !== selfId && u.email.toLowerCase() === email)
  if (taken) throw new Error(`That email is already used by ${taken.full_name}`)
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

export async function createUser(input: { actorId: Uuid; full_name: string; email: string; role: RoleId; team_lead_id: Uuid | null }): Promise<User> {
  requireManager(input.actorId)
  const team_lead_id = input.role === 'cleaner' ? input.team_lead_id : null
  checkDetails({ ...input, team_lead_id })
  const row: User = {
    id: newId('user'),
    full_name: input.full_name.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role,
    team_lead_id,
    active: true,
    created_at: serverNow(),
  }
  db.users.push(row)
  return copy(row)
}

export async function updateUser(input: {
  actorId: Uuid
  userId: Uuid
  patch: { full_name: string; email: string; role: RoleId; team_lead_id: Uuid | null }
}): Promise<User> {
  const actor = requireManager(input.actorId)
  const user = requireUser(input.userId)
  if (user.id === actor.id || user.role === 'manager') throw new Error("The manager's own account can't be changed here")
  const team_lead_id = input.patch.role === 'cleaner' ? input.patch.team_lead_id : null
  checkDetails({ ...input.patch, team_lead_id }, user.id)
  if (user.role === 'team_lead' && input.patch.role !== 'team_lead') releaseGroup(user.id)
  Object.assign(user, { full_name: input.patch.full_name.trim(), email: input.patch.email.trim().toLowerCase(), role: input.patch.role, team_lead_id })
  return copy(user)
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
