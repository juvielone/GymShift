import type { User } from '@/types'
import { ANGEL, CARLY, GINO, GLADYS, JOSH, KYLE } from './ids'

const created = '2026-10-12T09:00:00+11:00'

export const users: User[] = [
  { id: CARLY, full_name: 'Carly', username: 'carly', role: 'manager', team_lead_id: null, active: true, created_at: created },
  // Team lead who also works shifts on the roster.
  { id: GLADYS, full_name: 'Gladys', username: 'gladys', role: 'team_lead', team_lead_id: null, active: true, created_at: created },
  // Gladys's group
  { id: JOSH, full_name: 'Josh Lagos', username: 'josh', role: 'cleaner', team_lead_id: GLADYS, active: true, created_at: created },
  { id: KYLE, full_name: 'Kyle', username: 'kyle', role: 'cleaner', team_lead_id: GLADYS, active: true, created_at: created },
  { id: GINO, full_name: 'Gino', username: 'gino', role: 'cleaner', team_lead_id: GLADYS, active: true, created_at: created },
  // Reports to Carly directly
  { id: ANGEL, full_name: 'Angel', username: 'angel', role: 'cleaner', team_lead_id: null, active: true, created_at: created },
]
