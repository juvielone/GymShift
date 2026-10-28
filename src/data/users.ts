import type { Role, RoleId, User, Uuid } from '@/types'
import { MARIA } from '@/mocks'
import { copy, db, requireUser, roleOf } from './store'

// Mock session. Replaced by Supabase auth (magic link / password) later.
// Starts as Maria so the seeded scenario (her night shift in progress) opens on the cleaner home.
let currentUserId: Uuid = MARIA

export async function getCurrentUser(): Promise<User> {
  return copy(requireUser(currentUserId))
}

/** Dev helper: sign in as another mock user to see the app from their role. */
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
