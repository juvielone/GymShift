import type { User } from '@/types'
import { ANA, CARLY, GLADYS, LINH, MARIA, PRIYA, TOMAS } from './ids'

const created = '2026-10-12T09:00:00+11:00'

export const users: User[] = [
  { id: CARLY, full_name: 'Carly', email: 'carly@example.com', role: 'manager', team_lead_id: null, active: true, created_at: created },
  { id: GLADYS, full_name: 'Gladys', email: 'gladys@example.com', role: 'team_lead', team_lead_id: null, active: true, created_at: created },
  // Gladys's group
  { id: MARIA, full_name: 'Maria Santos', email: 'maria@example.com', role: 'cleaner', team_lead_id: GLADYS, active: true, created_at: created },
  { id: PRIYA, full_name: 'Priya Nair', email: 'priya@example.com', role: 'cleaner', team_lead_id: GLADYS, active: true, created_at: created },
  { id: TOMAS, full_name: 'Tomas Reyes', email: 'tomas@example.com', role: 'cleaner', team_lead_id: GLADYS, active: true, created_at: created },
  // Report to Carly directly
  { id: LINH, full_name: 'Linh Tran', email: 'linh@example.com', role: 'cleaner', team_lead_id: null, active: true, created_at: created },
  { id: ANA, full_name: 'Ana Kovac', email: 'ana@example.com', role: 'cleaner', team_lead_id: null, active: true, created_at: created },
]
