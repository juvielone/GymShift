import type { Role, RoleId, User, Uuid } from '@/types'
import { CARLY, GLADYS, JOSH } from '@/mocks'
import { copy, db, requireUser, roleOf } from './store'

// Mock session. Replaced by Supabase auth (magic link / password) later.
// Starts as Josh so the seeded scenario (his night shift about to start) opens on the cleaner home.
let currentUserId: Uuid = JOSH

export async function getCurrentUser(): Promise<User> {
  return copy(requireUser(currentUserId))
}

/** Demo login: one account per role (manager, team lead, cleaner). Removed when real auth arrives. */
export async function getDemoAccounts(): Promise<User[]> {
  return copy([CARLY, GLADYS, JOSH].map(requireUser))
}

/** Mock sign-in, used by the demo login and the dev switcher to see the app from a user's role. */
export async function setMockCurrentUser(id: Uuid): Promise<void> {
  requireUser(id)
  currentUserId = id
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
