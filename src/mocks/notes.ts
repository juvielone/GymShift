import type { Note } from '@/types'
import { GLADYS, CARLY, ANGEL, JOSH, KYLE, shiftId } from './ids'

export const notes: Note[] = [
  {
    id: 'note-01', shift_id: shiftId('2026-11-02', 'morning'), user_id: JOSH, tag: 'supplies_low',
    body: "Out of toilet paper refills in the men's change room. Floor cleaner below a quarter.",
    arrive_by: null, created_at: '2026-11-02T09:50:00+11:00', done_at: null, done_by: null,
  },
  {
    id: 'note-02', shift_id: shiftId('2026-11-03', 'morning'), user_id: KYLE, tag: 'supplies_low',
    body: 'Hand soap refills running low (2 left).',
    arrive_by: null, created_at: '2026-11-03T09:55:00+11:00', done_at: '2026-11-04T08:15:00+11:00', done_by: CARLY,
  },
  {
    id: 'note-03', shift_id: shiftId('2026-11-03', 'night'), user_id: ANGEL, tag: 'issue',
    body: 'Studio 2 vacuum losing suction — filter probably needs replacing.',
    arrive_by: null, created_at: '2026-11-03T22:20:00+11:00', done_at: null, done_by: null,
  },
  {
    id: 'note-04', shift_id: shiftId('2026-11-04', 'morning'), user_id: GLADYS, tag: 'general',
    body: 'All done. Front desk asked if we can also do the spin room mirrors on Fridays.',
    arrive_by: null, created_at: '2026-11-04T09:55:00+11:00', done_at: null, done_by: null,
  },
]
