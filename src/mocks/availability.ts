import type { Availability } from '@/types'
import { ANA, PRIYA, TOMAS } from './ids'

export const availability: Availability[] = [
  { id: 'avail-01', user_id: PRIYA, date: '2026-10-31', note: 'Family wedding', created_at: '2026-10-20T18:10:00+11:00' },
  { id: 'avail-02', user_id: PRIYA, date: '2026-11-01', note: 'Family wedding', created_at: '2026-10-20T18:10:00+11:00' },
  { id: 'avail-03', user_id: TOMAS, date: '2026-11-04', note: 'Uni exam', created_at: '2026-10-21T08:45:00+11:00' },
  { id: 'avail-04', user_id: ANA, date: '2026-11-07', note: null, created_at: '2026-10-22T12:30:00+11:00' },
]
