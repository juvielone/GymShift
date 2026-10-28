import type { Correction } from '@/types'
import { CARLY } from './ids'

// ce-02 keeps its original 1:40 pm server_time forever; this row makes 10:00 am the effective time.
export const corrections: Correction[] = [
  {
    id: 'correction-01',
    clock_event_id: 'ce-02',
    old_time: '2026-10-26T13:40:00+11:00',
    new_time: '2026-10-26T10:00:00+11:00',
    reason: 'Forgot to clock out before leaving. Gladys confirmed Maria finished at 10:00 am.',
    corrected_by: CARLY,
    created_at: '2026-10-26T14:05:00+11:00',
  },
]
