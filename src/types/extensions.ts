// Table: extensions — requests for extra time on a shift. Approved by the manager only.
import type { RequestStatus, Timestamp, Uuid } from './common'

export interface Extension {
  id: Uuid
  shift_id: Uuid
  requested_by: Uuid
  /** What was asked: 1–30. */
  minutes: number
  /**
   * What the manager approved, set when approved: the time actually worked can differ from what was asked
   * (0 when earlier approvals already cover it). null = as asked (approvals before this column existed).
   */
  approved_min: number | null
  reason: string
  status: RequestStatus
  created_at: Timestamp
  decided_by: Uuid | null
  decided_at: Timestamp | null
}
