// Table: availability — dates a staff member is unavailable for the next fortnight.
import type { DateString, Timestamp, Uuid } from './common'

export interface Availability {
  id: Uuid
  user_id: Uuid
  date: DateString
  note: string | null
  created_at: Timestamp
}
