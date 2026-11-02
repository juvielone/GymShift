// Table: correction_requests — a cleaner asks the manager to fix an entry. Decided once
// (pending → approved/declined); never edited or deleted. "Stayed to finish" is an extension instead.
import type { RequestStatus, Timestamp, Uuid } from './common'

/** 'void': a clock-in made by mistake. 'end_time': when they really finished (late or automatic clock-out). */
export type CorrectionRequestKind = 'void' | 'end_time'

export type CorrectionReason =
  /** void */
  | 'accidental_tap'
  | 'wrong_time'
  /** end_time */
  | 'forgot_clock_out'
  | 'confirm_auto_close'
  /** either; needs a note */
  | 'other'

export interface CorrectionRequest {
  id: Uuid
  kind: CorrectionRequestKind
  /** 'void': the clock-in. 'end_time': the clock-out. */
  clock_event_id: Uuid
  requested_by: Uuid
  reason_code: CorrectionReason
  /** Required for 'other'. */
  note: string | null
  /** 'end_time' only: when they say they finished. */
  requested_time: Timestamp | null
  status: RequestStatus
  created_at: Timestamp
  decided_by: Uuid | null
  decided_at: Timestamp | null
}
