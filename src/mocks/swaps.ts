import type { Swap } from '@/types'
import { CARLY, GLADYS, ANGEL, JOSH, KYLE, GINO, shiftId } from './ids'

export const swaps: Swap[] = [
  // Approved cover → shift-change-01 reassigned the shift to Angel (Carly picked her; nobody had offered).
  {
    id: 'swap-01', shift_id: shiftId('2026-10-27', 'night'), kind: 'cover', requested_by: GLADYS,
    target_user_id: null, covered_by: ANGEL, accepted_at: null, reason: 'Medical appointment', status: 'approved',
    created_at: '2026-10-24T11:15:00+11:00', decided_by: CARLY, decided_at: '2026-10-25T16:20:00+11:00',
  },
  // Kyle said "Not me".
  {
    id: 'swap-02', shift_id: shiftId('2026-10-31', 'morning'), kind: 'swap', requested_by: JOSH,
    target_user_id: KYLE, covered_by: null, accepted_at: null, reason: 'Kids sport on Saturday morning', status: 'declined',
    created_at: '2026-10-24T09:00:00+11:00', decided_by: KYLE, decided_at: '2026-10-24T12:10:00+11:00',
  },
  // Kyle said yes: waiting for Gladys or Carly.
  {
    id: 'swap-03', shift_id: shiftId('2026-11-03', 'morning'), kind: 'swap', requested_by: GINO,
    target_user_id: KYLE, covered_by: KYLE, accepted_at: '2026-10-28T09:05:00+11:00', reason: 'Lecture moved to Tuesday morning', status: 'pending',
    created_at: '2026-10-28T08:20:00+11:00', decided_by: null, decided_at: null,
  },
  // Open shift nobody has offered on yet: every cleaner sees it.
  {
    id: 'swap-04', shift_id: shiftId('2026-11-04', 'morning'), kind: 'cover', requested_by: ANGEL,
    target_user_id: null, covered_by: null, accepted_at: null, reason: 'Sick', status: 'pending',
    created_at: '2026-10-28T14:40:00+11:00', decided_by: null, decided_at: null,
  },
  // Gladys asked Josh: waiting for his answer (then Carly decides, because Gladys is part of it).
  {
    id: 'swap-05', shift_id: shiftId('2026-11-03', 'night'), kind: 'swap', requested_by: GLADYS,
    target_user_id: JOSH, covered_by: null, accepted_at: null, reason: 'Family', status: 'pending',
    created_at: '2026-10-28T16:10:00+11:00', decided_by: null, decided_at: null,
  },
  // Josh asked Kyle: waiting for Kyle.
  {
    id: 'swap-06', shift_id: shiftId('2026-11-05', 'morning'), kind: 'swap', requested_by: JOSH,
    target_user_id: KYLE, covered_by: null, accepted_at: null, reason: null, status: 'pending',
    created_at: '2026-10-28T17:30:00+11:00', decided_by: null, decided_at: null,
  },
]
