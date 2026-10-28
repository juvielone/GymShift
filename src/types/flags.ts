// Table: flags — automatic attendance flags for the manager to review. Flags never block or change hours.
import type { Timestamp, Uuid } from './common'

export type FlagKind =
  /** distance − accuracy > radius at clock-in or clock-out */
  | 'off_site'
  /** location denied, timed out or unavailable */
  | 'no_location'
  /** clock event with no matching shift */
  | 'unscheduled'
  /** no clock-in no_show_after_min after shift start */
  | 'no_show'
  /** no clock-out missing_out_after_min after shift end */
  | 'missing_clock_out'
  /** worked longer than the standard shift without an approved extension */
  | 'over_without_extension'

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
