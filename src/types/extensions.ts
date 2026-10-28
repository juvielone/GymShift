// Table: extensions — requests for extra time on a shift. Approved by the manager only.
import type { RequestStatus, Timestamp, Uuid } from './common'

export interface Extension {
  id: Uuid
  shift_id: Uuid
  requested_by: Uuid
  /** 1–30. A shift can never be approved beyond max_shift_min (3.5h) in total. */
  minutes: number
  reason: string
  status: RequestStatus
  created_at: Timestamp
  decided_by: Uuid | null
  decided_at: Timestamp | null
}
