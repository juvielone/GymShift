// Table: photos — work photos (max 10 per shift), stored in a private Supabase Storage bucket.
// A photo belongs to a rostered shift, or to a clock-in off the roster (…19_off_roster_photos.sql): exactly one.
import type { Timestamp, Uuid } from './common'

export interface Photo {
  id: Uuid
  /** The rostered shift; null when the photo is for time off the roster. */
  shift_id: Uuid | null
  /** The off-roster clock-in; null when the photo is for a rostered shift. */
  clock_event_id: Uuid | null
  user_id: Uuid
  /** Object path in the private bucket; served via short-lived signed URLs. */
  storage_path: string
  /** ~150 KB after on-device compression. */
  size_bytes: number
  uploaded_at: Timestamp
  /** uploaded_at + photo_retention_months; auto-deleted after this. */
  expires_at: Timestamp
  /** Removed by mistake: the image is deleted, this row stays as the record. null = still shown. */
  removed_at: Timestamp | null
  removed_by: Uuid | null
}
