// Table: user_contacts — how Carly can reach someone. Kept apart from users because everyone can read
// users (names for the roster), while only the manager and the person themselves can read this.
// Contact only: never used to sign in, never verified. Changed in place (it isn't an hours record).
import type { Timestamp, Uuid } from './common'

export interface UserContact {
  user_id: Uuid
  /** Australian mobile, stored as +614xxxxxxxx. null = none given. */
  phone: string | null
  updated_by: Uuid
  updated_at: Timestamp
}
