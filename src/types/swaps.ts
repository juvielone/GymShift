// Table: swaps — swap with a named colleague, or release a shift for cover. Approved by manager or team lead.
import type { RequestStatus, Timestamp, Uuid } from './common'

export type SwapKind = 'swap' | 'cover'

export interface Swap {
  id: Uuid
  shift_id: Uuid
  kind: SwapKind
  requested_by: Uuid
  /** 'swap': the named colleague. 'cover': null (released to anyone). */
  target_user_id: Uuid | null
  /** 'cover': the colleague who picked it up, once someone has. */
  covered_by: Uuid | null
  reason: string | null
  status: RequestStatus
  created_at: Timestamp
  decided_by: Uuid | null
  decided_at: Timestamp | null
}
