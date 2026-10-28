import type { Note } from '@/types'
import { ANA, CARLY, LINH, MARIA, PRIYA, shiftId } from './ids'

export const notes: Note[] = [
  {
    id: 'note-01', shift_id: shiftId('2026-10-26', 'morning'), user_id: MARIA, tag: 'supplies_low',
    body: "Out of toilet paper refills in the men's change room. Floor cleaner below a quarter.",
    created_at: '2026-10-26T09:50:00+11:00', done_at: null, done_by: null,
  },
  {
    id: 'note-02', shift_id: shiftId('2026-10-27', 'morning'), user_id: PRIYA, tag: 'supplies_low',
    body: 'Hand soap refills running low (2 left).',
    created_at: '2026-10-27T09:55:00+11:00', done_at: '2026-10-28T08:15:00+11:00', done_by: CARLY,
  },
  {
    id: 'note-03', shift_id: shiftId('2026-10-27', 'night'), user_id: LINH, tag: 'issue',
    body: 'Studio 2 vacuum losing suction — filter probably needs replacing.',
    created_at: '2026-10-27T22:20:00+11:00', done_at: null, done_by: null,
  },
  {
    id: 'note-04', shift_id: shiftId('2026-10-28', 'morning'), user_id: ANA, tag: 'general',
    body: 'All done. Front desk asked if we can also do the spin room mirrors on Fridays.',
    created_at: '2026-10-28T09:55:00+11:00', done_at: null, done_by: null,
  },
]
