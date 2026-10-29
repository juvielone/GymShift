import type { Extension } from '@/types'
import { CARLY, ANGEL, KYLE, shiftId } from './ids'

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
]
