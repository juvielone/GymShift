// Work photos. Max per shift and retention come from settings. The real upload (compressed to ~150 KB
// on the phone, private bucket, signed URLs) arrives with Supabase Storage; this records the metadata only.
import type { Photo, Uuid } from '@/types'
import { copy, db, newId, serverNow } from './store'
import { compareTs } from '@/lib/rules'

export async function getPhotos(filter: { shiftId?: Uuid; userId?: Uuid } = {}): Promise<Photo[]> {
  return copy(
    db.photos
      .filter((p) => (filter.shiftId === undefined || p.shift_id === filter.shiftId) && (filter.userId === undefined || p.user_id === filter.userId))
      .sort((a, b) => compareTs(a.uploaded_at, b.uploaded_at)),
  )
}

export async function addPhoto(input: { shiftId: Uuid; userId: Uuid; sizeBytes: number }): Promise<Photo> {
  const shift = db.shifts.find((s) => s.id === input.shiftId)
  if (!shift) throw new Error(`Unknown shift ${input.shiftId}`)
  if (db.photos.filter((p) => p.shift_id === shift.id).length >= db.settings.max_photos_per_shift) {
    throw new Error(`A shift can have at most ${db.settings.max_photos_per_shift} photos`)
  }
  const uploaded_at = serverNow()
  const expires = new Date(uploaded_at)
  expires.setUTCMonth(expires.getUTCMonth() + db.settings.photo_retention_months)
  const id = newId('photo')
  const row: Photo = {
    id,
    shift_id: shift.id,
    user_id: input.userId,
    storage_path: `shifts/${shift.id}/${id}.jpg`,
    size_bytes: input.sizeBytes,
    uploaded_at,
    expires_at: expires.toISOString(),
  }
  db.photos.push(row)
  return copy(row)
}
