// Sign-in secrets for the mock. NOT a table of ours: with Supabase these live (hashed) in auth.users,
// set only by a server function, and never reach the app. Staff have a 6-digit PIN; the manager a password.
import { ANGEL, CARLY, GINO, GLADYS, JOSH, KYLE } from './ids'
import type { Uuid } from '@/types'

export interface Credential {
  user_id: Uuid
  secret: string
}

export const credentials: Credential[] = [
  { user_id: CARLY, secret: 'carly-demo' },
  { user_id: GLADYS, secret: '204816' },
  { user_id: JOSH, secret: '318274' },
  { user_id: KYLE, secret: '529163' },
  { user_id: GINO, secret: '740352' },
  { user_id: ANGEL, secret: '863091' },
]
