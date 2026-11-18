import type { Availability } from '@/types'
import { GLADYS, KYLE, GINO } from './ids'

export const availability: Availability[] = [
  { id: 'avail-01', user_id: KYLE, date: '2026-11-07', note: 'Family wedding', created_at: '2026-10-27T18:10:00+11:00' },
  { id: 'avail-02', user_id: KYLE, date: '2026-11-08', note: 'Family wedding', created_at: '2026-10-27T18:10:00+11:00' },
  { id: 'avail-03', user_id: GINO, date: '2026-11-11', note: 'Uni exam', created_at: '2026-10-28T08:45:00+11:00' },
  { id: 'avail-04', user_id: GLADYS, date: '2026-11-14', note: null, created_at: '2026-10-29T12:30:00+11:00' },
  // Next fortnight: clashes with the pattern a "copy last fortnight" would bring over (Gino works 19 Nov morning).
  { id: 'avail-05', user_id: GINO, date: '2026-11-19', note: 'Dentist', created_at: '2026-11-03T09:20:00+11:00' },
]
