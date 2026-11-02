import type { ClockVoid } from '@/types'
import { CARLY } from './ids'

// Angel's clock-in from home on 26 Oct (ce-13) and the clock-out 2 minutes later (ce-14). Both events stay;
// these rows say they no longer count. Carly voided them directly, so no request.
export const clockVoids: ClockVoid[] = [
  {
    id: 'void-01', clock_event_id: 'ce-13', old_time: '2026-10-26T15:10:00+11:00',
    reason: 'Tapped Clock in at home', voided_by: CARLY, voided_at: '2026-10-26T16:00:00+11:00', correction_request_id: null,
  },
  {
    id: 'void-02', clock_event_id: 'ce-14', old_time: '2026-10-26T15:12:00+11:00',
    reason: 'Tapped Clock in at home', voided_by: CARLY, voided_at: '2026-10-26T16:00:00+11:00', correction_request_id: null,
  },
]
