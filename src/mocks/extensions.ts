import type { Extension } from '@/types'
import { CARLY, ANGEL, GINO, JOSH, KYLE, shiftId } from './ids'

export const extensions: Extension[] = [
  {
    id: 'ext-01', shift_id: shiftId('2026-11-03', 'night'), requested_by: ANGEL, minutes: 25,
    reason: 'Function room left very messy after the evening event.', status: 'approved', approved_min: null,
    created_at: '2026-11-03T21:40:00+11:00', decided_by: CARLY, decided_at: '2026-11-03T21:48:00+11:00',
  },
  {
    id: 'ext-02', shift_id: shiftId('2026-11-03', 'morning'), requested_by: KYLE, minutes: 15,
    reason: 'Want to finish deep-cleaning the showers.', status: 'declined', approved_min: null,
    created_at: '2026-11-03T09:30:00+11:00', decided_by: CARLY, decided_at: '2026-11-03T09:41:00+11:00',
  },
  // Asked after clocking out 42 min past the end ("Stayed to finish"), for Carly to decide.
  {
    id: 'ext-03', shift_id: shiftId('2026-11-02', 'night'), requested_by: GINO, minutes: 20,
    reason: 'Stayed to finish', status: 'pending', approved_min: null,
    created_at: '2026-11-02T22:43:00+11:00', decided_by: null, decided_at: null,
  },
  // Sat 31 Oct night, Kyle: 30 min approved, then "Stayed to finish" after clocking out at 3h 32m. The approved
  // 3h 30m (plus the leeway) already covers it: the card offers Close.
  {
    id: 'ext-04', shift_id: shiftId('2026-10-31', 'night'), requested_by: KYLE, minutes: 30,
    reason: 'Extra cleaning needed', status: 'approved', approved_min: null,
    created_at: '2026-10-31T21:20:00+11:00', decided_by: CARLY, decided_at: '2026-10-31T21:31:00+11:00',
  },
  {
    id: 'ext-05', shift_id: shiftId('2026-10-31', 'night'), requested_by: KYLE, minutes: 30,
    reason: 'Stayed to finish', status: 'pending', approved_min: null,
    created_at: '2026-10-31T22:32:00+11:00', decided_by: null, decided_at: null,
  },
  // Sun 1 Nov night, Josh: 30 min approved, then Carly asked him to stay back an hour (members in the studio).
  // Asked for 30 more, worked 4h 30m. The card offers Approve 4h 30m (past 3h 30m, with a warning) or Correct time.
  {
    id: 'ext-06', shift_id: shiftId('2026-11-01', 'night'), requested_by: JOSH, minutes: 30,
    reason: 'Extra cleaning needed, and fan dusting', status: 'approved', approved_min: null,
    created_at: '2026-11-01T21:10:00+11:00', decided_by: CARLY, decided_at: '2026-11-01T21:25:00+11:00',
  },
  {
    id: 'ext-07', shift_id: shiftId('2026-11-01', 'night'), requested_by: JOSH, minutes: 30,
    reason: 'Carly asked me to stay', status: 'pending', approved_min: null,
    created_at: '2026-11-01T22:05:00+11:00', decided_by: null, decided_at: null,
  },
]
