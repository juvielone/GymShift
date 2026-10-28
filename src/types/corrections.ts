// Table: corrections — append-only log of attendance time corrections (manager only).
// The original clock_event is never overwritten; the latest correction for an event is its effective time.
import type { Timestamp, Uuid } from './common'

export interface Correction {
  id: Uuid
  clock_event_id: Uuid
  /** Effective time before this correction (original server_time or a previous correction). */
  old_time: Timestamp
  new_time: Timestamp
  /** Required, non-empty. */
  reason: string
  corrected_by: Uuid
  created_at: Timestamp
}
