import type { User } from '@/types'
import { ANGEL, CARLY, GINO, GLADYS, JOSH, KYLE } from './ids'

const created = '2026-10-12T09:00:00+11:00'

export const users: User[] = [
  { id: CARLY, full_name: 'Carly', username: 'carly', email: 'carly@example.com', role: 'manager', team_lead_id: null, active: true, created_at: created },
  // Team lead who also works shifts on the roster.
  { id: GLADYS, full_name: 'Gladys', username: 'gladys', email: null, role: 'team_lead', team_lead_id: null, active: true, created_at: created },
  // Gladys's group
  { id: JOSH, full_name: 'Josh Lagos', username: 'josh', email: null, role: 'cleaner', team_lead_id: GLADYS, active: true, created_at: created },
  { id: KYLE, full_name: 'Kyle', username: 'kyle', email: null, role: 'cleaner', team_lead_id: GLADYS, active: true, created_at: created },
  { id: GINO, full_name: 'Gino', username: 'gino', email: null, role: 'cleaner', team_lead_id: GLADYS, active: true, created_at: created },
  // Reports to Carly directly
  { id: ANGEL, full_name: 'Angel', username: 'angel', email: null, role: 'cleaner', team_lead_id: null, active: true, created_at: created },
]
