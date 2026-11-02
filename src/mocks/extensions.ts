import type { Extension } from '@/types'
import { CARLY, ANGEL, GINO, KYLE, shiftId } from './ids'

export const extensions: Extension[] = [
  {
    id: 'ext-01', shift_id: shiftId('2026-10-27', 'night'), requested_by: ANGEL, minutes: 25,
    reason: 'Function room left very messy after the evening event.', status: 'approved',
    created_at: '2026-10-27T21:40:00+11:00', decided_by: CARLY, decided_at: '2026-10-27T21:48:00+11:00',
  },
  {
    id: 'ext-02', shift_id: shiftId('2026-10-27', 'morning'), requested_by: KYLE, minutes: 15,
    reason: 'Want to finish deep-cleaning the showers.', status: 'declined',
    created_at: '2026-10-27T09:30:00+11:00', decided_by: CARLY, decided_at: '2026-10-27T09:41:00+11:00',
  },
  // Asked after clocking out 42 min past the end ("Stayed to finish"), for Carly to decide.
  {
    id: 'ext-03', shift_id: shiftId('2026-10-26', 'night'), requested_by: GINO, minutes: 20,
    reason: 'Stayed to finish', status: 'pending',
    created_at: '2026-10-26T22:43:00+11:00', decided_by: null, decided_at: null,
  },
]
