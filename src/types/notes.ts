// Table: notes — shift notes and supply alerts.
import type { Timestamp, Uuid } from './common'

export type NoteTag = 'supplies_low' | 'issue' | 'general' | 'running_late'

export interface Note {
  id: Uuid
  shift_id: Uuid
  user_id: Uuid
  body: string
  tag: NoteTag | null
  /** 'running_late' only: when they expect to arrive. The no-show check waits until this plus no_show_after_min. */
  arrive_by: Timestamp | null
  created_at: Timestamp
  /** 'supplies_low' and 'issue' notes stay on the manager dashboard until marked done. */
  done_at: Timestamp | null
  done_by: Uuid | null
}
