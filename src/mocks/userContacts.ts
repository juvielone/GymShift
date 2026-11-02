import type { UserContact } from '@/types'
import { CARLY, JOSH } from './ids'

// Only people who gave a number have a row.
export const userContacts: UserContact[] = [{ user_id: JOSH, phone: '+61412345678', updated_by: CARLY, updated_at: '2026-10-12T09:00:00+11:00' }]
