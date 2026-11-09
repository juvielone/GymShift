// Table: flags — automatic attendance flags for the manager to review. Flags never block or change hours.
import type { Timestamp, Uuid } from './common'

export type FlagKind =
  /** distance − accuracy > radius at clock-in or clock-out */
  | 'off_site'
  /** location denied, timed out or unavailable */
  | 'no_location'
  /** clock event with no matching shift */
  | 'unscheduled'
  /** no clock-in no_show_after_min after shift start; resolved when they clock in (their late start is flagged instead) */
  | 'no_show'
  /** no clock-out missing_out_after_min after the expected finish (clock-in plus approved length) */
  | 'missing_clock_out'
  /** worked longer than the approved length plus over_length_grace_min */
  | 'over_without_extension'
  /** clocked out within short_session_flag_min of clocking in */
  | 'short_session'
  /** clocked in more than start_mismatch_min before or after the rostered start */
  | 'off_start'

export interface Flag {
  id: Uuid
  kind: FlagKind
  user_id: Uuid
  /** null only for unscheduled clock events. */
  shift_id: Uuid | null
  clock_event_id: Uuid | null
  /** Human-readable detail, e.g. "312 m from gym (±40 m)". */
  detail: string
  created_at: Timestamp
  resolved_at: Timestamp | null
  resolved_by: Uuid | null
}
