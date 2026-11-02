// Table: swaps — hand a shift to a named colleague ('swap') or to anyone free ('cover'). Someone says yes
// first, then the manager or team lead approves (never someone who is part of the request).
import type { RequestStatus, Timestamp, Uuid } from './common'

export type SwapKind = 'swap' | 'cover'

export interface Swap {
  id: Uuid
  shift_id: Uuid
  kind: SwapKind
  requested_by: Uuid
  /** 'swap': the named colleague. 'cover': null (open to anyone free). */
  target_user_id: Uuid | null
  /** Who takes the shift: set when they say yes, or by the approver for a cover nobody offered on. */
  covered_by: Uuid | null
  /** When the person taking it said yes; null until then (and for a cover the approver filled). */
  accepted_at: Timestamp | null
  reason: string | null
  /** 'declined' by the approver, or by the named colleague ("Not me"); 'withdrawn' by the person who asked. */
  status: RequestStatus
  created_at: Timestamp
  decided_by: Uuid | null
  decided_at: Timestamp | null
}
