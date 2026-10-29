// Tables: shifts, shift_changes
import type { DateString, TimeString, Timestamp, Uuid } from './common'

export type ShiftType = 'morning' | 'night'

/**
 * Staff only see published shifts. A draft nobody has seen may be deleted; a published shift
 * is never deleted, only set to 'cancelled' (logged to shift_changes).
 */
export type ShiftStatus = 'draft' | 'published' | 'cancelled'

export interface Shift {
  id: Uuid
  date: DateString
  type: ShiftType
  /** Defaults: morning 07:00, night 19:00. Editable per shift. */
  start_time: TimeString
  /** Defaults to start + 3h (standard_shift_min). */
  end_time: TimeString
  assigned_user_id: Uuid
  status: ShiftStatus
  /** First day (Monday) of the fortnight this shift belongs to. */
  fortnight_start: DateString
  created_by: Uuid
  created_at: Timestamp
  published_at: Timestamp | null
}

/** Fields of a published shift whose changes are audited. */
export type ShiftChangeField = 'date' | 'type' | 'start_time' | 'end_time' | 'assigned_user_id' | 'status'

/** Append-only audit log: every change to a published shift (who, when, old value, new value). */
export interface ShiftChange {
  id: Uuid
  shift_id: Uuid
  field: ShiftChangeField
  old_value: string
  new_value: string
  changed_by: Uuid
  changed_at: Timestamp
  /** Set when the change came from an approved swap/cover. */
  swap_id: Uuid | null
}
