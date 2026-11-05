// Tables: shift_instructions, shift_instruction_reads — notes for whoever works a shift, from Carly or their team lead.
import type { Timestamp, Uuid } from './common'

/**
 * A note left on a shift ("Please do the dusting"). It belongs to the shift, so a swap passes it on.
 * Never edited or deleted: whoever wrote it, or the manager, can take it back once (withdrawn_*).
 */
export interface ShiftInstruction {
  id: Uuid
  shift_id: Uuid
  author_id: Uuid
  body: string
  created_at: Timestamp
  withdrawn_at: Timestamp | null
  withdrawn_by: Uuid | null
}

/** "Got it": append-only, one row per note and person. */
export interface ShiftInstructionRead {
  instruction_id: Uuid
  user_id: Uuid
  seen_at: Timestamp
}
