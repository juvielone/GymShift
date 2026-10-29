import type { Swap } from '@/types'
import { ANA, CARLY, GLADYS, LINH, JOSH, PRIYA, TOMAS, shiftId } from './ids'

export const swaps: Swap[] = [
  // Approved cover → shift-change-01 reassigned the shift to Linh.
  {
    id: 'swap-01', shift_id: shiftId('2026-10-27', 'night'), kind: 'cover', requested_by: ANA,
    target_user_id: null, covered_by: LINH, reason: 'Medical appointment', status: 'approved',
    created_at: '2026-10-24T11:15:00+11:00', decided_by: CARLY, decided_at: '2026-10-25T16:20:00+11:00',
  },
  // Declined swap within Gladys's group.
  {
    id: 'swap-02', shift_id: shiftId('2026-10-31', 'morning'), kind: 'swap', requested_by: JOSH,
    target_user_id: PRIYA, covered_by: null, reason: 'Kids sport on Saturday morning', status: 'declined',
    created_at: '2026-10-24T09:00:00+11:00', decided_by: GLADYS, decided_at: '2026-10-24T12:10:00+11:00',
  },
  // Pending swap awaiting Gladys or Carly.
  {
    id: 'swap-03', shift_id: shiftId('2026-11-03', 'morning'), kind: 'swap', requested_by: TOMAS,
    target_user_id: PRIYA, covered_by: null, reason: 'Lecture moved to Tuesday morning', status: 'pending',
    created_at: '2026-10-28T08:20:00+11:00', decided_by: null, decided_at: null,
  },
]
