import type { Extension } from '@/types'
import { CARLY, LINH, JOSH, PRIYA, shiftId } from './ids'

export const extensions: Extension[] = [
  {
    id: 'ext-01', shift_id: shiftId('2026-10-27', 'night'), requested_by: LINH, minutes: 25,
    reason: 'Function room left very messy after the evening event.', status: 'approved',
    created_at: '2026-10-27T21:40:00+11:00', decided_by: CARLY, decided_at: '2026-10-27T21:48:00+11:00',
  },
  {
    id: 'ext-02', shift_id: shiftId('2026-10-27', 'morning'), requested_by: PRIYA, minutes: 15,
    reason: 'Want to finish deep-cleaning the showers.', status: 'declined',
    created_at: '2026-10-27T09:30:00+11:00', decided_by: CARLY, decided_at: '2026-10-27T09:41:00+11:00',
  },
  {
    id: 'ext-03', shift_id: shiftId('2026-10-28', 'night'), requested_by: JOSH, minutes: 20,
    reason: 'Cleaning supplies delivery arrived — need to unpack and store it.', status: 'pending',
    created_at: '2026-10-28T19:35:00+11:00', decided_by: null, decided_at: null,
  },
]
