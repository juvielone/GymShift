// Table: photos — work photos (max 10 per shift), stored in a private Supabase Storage bucket.
import type { Timestamp, Uuid } from './common'

export interface Photo {
  id: Uuid
  shift_id: Uuid
  user_id: Uuid
  /** Object path in the private bucket; served via short-lived signed URLs. */
  storage_path: string
  /** ~150 KB after on-device compression. */
  size_bytes: number
  uploaded_at: Timestamp
  /** uploaded_at + photo_retention_months; auto-deleted after this. */
  expires_at: Timestamp
}
