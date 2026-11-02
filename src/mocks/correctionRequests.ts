import type { CorrectionRequest } from '@/types'
import { KYLE } from './ids'

export const correctionRequests: CorrectionRequest[] = [
  // Kyle tapped Clock in at home on 28 Oct (ce-15); asking clocked him out (ce-16). Waiting for Carly.
  {
    id: 'creq-01', kind: 'void', clock_event_id: 'ce-15', requested_by: KYLE, reason_code: 'accidental_tap', note: null,
    requested_time: null, status: 'pending', created_at: '2026-10-28T13:31:00+11:00', decided_by: null, decided_at: null,
  },
]
