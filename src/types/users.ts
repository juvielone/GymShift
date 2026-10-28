// Table: users (profile row linked 1:1 to Supabase auth.users). No public sign-up; the manager creates accounts.
import type { Timestamp, Uuid } from './common'
import type { RoleId } from './roles'

export interface User {
  id: Uuid
  full_name: string
  email: string
  role: RoleId
  /** The team lead whose group this user belongs to. null = reports to the manager directly. */
  team_lead_id: Uuid | null
  /** Deactivated users keep their history; rows are never deleted. */
  active: boolean
  created_at: Timestamp
}
