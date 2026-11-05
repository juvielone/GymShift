import type { ShiftInstruction, ShiftInstructionRead } from '@/types'
import { CARLY, GLADYS, JOSH, shiftId } from './ids'

// Josh's night shift on mock "today" has a note from Carly he hasn't seen yet; his Thu 5 Nov morning has one
// from Gladys (his team lead) that he has.
export const shiftInstructions: ShiftInstruction[] = [
  {
    id: 'instr-01', shift_id: shiftId('2026-10-28', 'night'), author_id: CARLY,
    body: 'Spin class finishes late tonight. Please do the spin room last, and give the mirrors a wipe.',
    created_at: '2026-10-28T15:20:00+11:00', withdrawn_at: null, withdrawn_by: null,
  },
  {
    id: 'instr-02', shift_id: shiftId('2026-11-05', 'morning'), author_id: GLADYS,
    body: 'Delivery of paper towels at 8. Please put them in the back store room.',
    created_at: '2026-10-27T18:05:00+11:00', withdrawn_at: null, withdrawn_by: null,
  },
]

export const shiftInstructionReads: ShiftInstructionRead[] = [
  { instruction_id: 'instr-02', user_id: JOSH, seen_at: '2026-10-27T19:40:00+11:00' },
]
