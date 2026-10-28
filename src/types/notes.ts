// Table: notes — shift notes and supply alerts.
import type { Timestamp, Uuid } from './common'

export type NoteTag = 'supplies_low' | 'issue' | 'general'

export interface Note {
  id: Uuid
  shift_id: Uuid
  user_id: Uuid
  body: string
  tag: NoteTag | null
  created_at: Timestamp
  /** 'supplies_low' notes stay on the manager dashboard until marked done. */
  done_at: Timestamp | null
  done_by: Uuid | null
}
