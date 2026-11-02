// Table: clock_voids — APPEND-ONLY. A voided clock event no longer counts for hours, the dashboard or the
// export; the event itself stays as recorded. Only the manager voids (directly, or by approving a request).
import type { Timestamp, Uuid } from './common'

export interface ClockVoid {
  id: Uuid
  /** One void per event. Voiding a clock-in voids the clock-out that closed it too. */
  clock_event_id: Uuid
  /** The event's effective time when it was voided. */
  old_time: Timestamp
  /** Required, non-empty. From a request: "Josh: accidental tap". */
  reason: string
  voided_by: Uuid
  voided_at: Timestamp
  /** The cleaner's request this answered; null when the manager voided it directly. */
  correction_request_id: Uuid | null
}
