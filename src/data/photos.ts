// Work photos. Max per shift, the upload window, the remove window and retention come from settings.
// The phone compresses each photo (~150 KB) before it gets here. Demo and trial keep images in
// photoFiles; the live app uses Supabase Storage (live.ts). The rows here are the record.
// A removed photo keeps its row (who removed it, when); only the image goes.
// Photos go on a rostered shift, or on the clock-in for time off the roster (PhotoTarget); same rules for both.
import type { ClockEvent, Photo, Uuid } from '@/types'
import { canRemoveOwnPhoto, compareTs, photoWindowClosesAt, photoWindowStart } from '@/lib/rules'
import { effectiveTime, isVoided, pairedOut } from './attendance'
import { deleteFile, fileUrl, putFile } from './photoFiles'
import { copy, db, newId, requireUser, roleOf, serverNow } from './store'

/** What photos are added to: a rostered shift, or the clock-in of time worked off the roster. */
export type PhotoTarget = { shiftId: Uuid } | { clockInId: Uuid }

/** Shown photos, oldest first. Removed ones only when asked for (the record view). */
export async function getPhotos(filter: { shiftId?: Uuid; clockInId?: Uuid; userId?: Uuid; includeRemoved?: boolean } = {}): Promise<Photo[]> {
  return copy(
    db.photos
      .filter(
        (p) =>
          (filter.shiftId === undefined || p.shift_id === filter.shiftId) &&
          (filter.clockInId === undefined || p.clock_event_id === filter.clockInId) &&
          (filter.userId === undefined || p.user_id === filter.userId) &&
          (filter.includeRemoved || p.removed_at === null),
      )
      .sort((a, b) => compareTs(a.uploaded_at, b.uploaded_at)),
  )
}

/** Where to load the image from. Becomes a short-lived signed URL with Supabase. null = no image. */
export async function getPhotoUrl(photo: Photo): Promise<string | null> {
  if (photo.removed_at !== null) return null
  return fileUrl(photo.storage_path)
}

/** The shift's counting clock-in, and where the upload window counts from after its last clock-out. */
function attendanceOf(shiftId: Uuid) {
  const events = db.clockEvents.filter((e) => e.shift_id === shiftId && !isVoided(e.id)).sort((a, b) => compareTs(a.server_time, b.server_time))
  const clockIn = events.find((e) => e.kind === 'in')
  const clockOut = events.findLast((e) => e.kind === 'out')
  const answered = clockOut ? latestAnswer(clockOut.id) : null
  return {
    clockIn: clockIn ? effectiveTime(clockIn) : null,
    clockOut: clockOut ? photoWindowStart({ server_time: clockOut.server_time, effective_time: effectiveTime(clockOut) }, answered) : null,
  }
}

/** When the cleaner last answered about a clock-out (a correction request), if they have. */
export const latestAnswer = (clockEventId: Uuid) =>
  db.correctionRequests
    .filter((r) => r.clock_event_id === clockEventId)
    .map((r) => r.created_at)
    .sort(compareTs)
    .at(-1) ?? null

/** Where the upload window counts from for an off-roster session: its clock-out (or the answer about it). */
function sessionWindowFrom(clockIn: ClockEvent) {
  const out = pairedOut(clockIn)
  return out ? photoWindowStart({ server_time: out.server_time, effective_time: effectiveTime(out) }, latestAnswer(out.id)) : null
}

/**
 * Own shift (or own off-roster session) only, from clock-in until the upload window after clock-out closes,
 * up to the shift's limit. Live mode runs this too before uploading, so an image isn't sent only to be refused
 * (the database checks again: add_photo, add_session_photo).
 */
export function requireCanAddPhoto(input: PhotoTarget & { userId: Uuid }) {
  const user = requireUser(input.userId)
  let holder: { shift_id: Uuid | null; clock_event_id: Uuid | null }
  let clockOut: string | null
  if ('shiftId' in input) {
    const shift = db.shifts.find((s) => s.id === input.shiftId)
    if (!shift) throw new Error(`Unknown shift ${input.shiftId}`)
    if (shift.assigned_user_id !== user.id) throw new Error('Photos can only be added to your own shift')
    const att = attendanceOf(shift.id)
    if (!att.clockIn) throw new Error('Photos can be added once you clock in')
    holder = { shift_id: shift.id, clock_event_id: null }
    clockOut = att.clockOut
  } else {
    const clockIn = db.clockEvents.find((e) => e.id === input.clockInId)
    if (!clockIn || clockIn.kind !== 'in' || isVoided(clockIn.id)) throw new Error('That clock-in is no longer on record')
    if (clockIn.user_id !== user.id) throw new Error('Photos can only be added to your own shift')
    if (clockIn.shift_id !== null) throw new Error('Add these photos to the rostered shift')
    holder = { shift_id: null, clock_event_id: clockIn.id }
    clockOut = sessionWindowFrom(clockIn)
  }
  const now = serverNow()
  const closes = photoWindowClosesAt(clockOut, db.settings)
  if (closes !== null && compareTs(now, closes) > 0) throw new Error('Photos for this shift have closed')
  const sameHolder = (p: Photo) => (holder.shift_id !== null ? p.shift_id === holder.shift_id : p.clock_event_id === holder.clock_event_id)
  if (db.photos.filter((p) => sameHolder(p) && p.removed_at === null).length >= db.settings.max_photos_per_shift) {
    throw new Error(`A shift can have at most ${db.settings.max_photos_per_shift} photos`)
  }
  return { user, holder, now }
}

export async function uploadPhoto(input: PhotoTarget & { userId: Uuid; file: Blob }): Promise<Photo> {
  const { user, holder, now } = requireCanAddPhoto(input)
  const expires = new Date(now)
  expires.setUTCMonth(expires.getUTCMonth() + db.settings.photo_retention_months)
  const id = newId('photo')
  const row: Photo = {
    id,
    ...holder,
    user_id: user.id,
    storage_path: `shifts/${holder.shift_id ?? holder.clock_event_id}/${id}.jpg`,
    size_bytes: input.file.size,
    uploaded_at: now,
    expires_at: expires.toISOString(),
    removed_at: null,
    removed_by: null,
  }
  // The image is stored before the row exists, so a failed save never leaves a row without a picture.
  await putFile(row.storage_path, input.file)
  db.photos.push(row)
  return copy(row)
}

/** The uploader within the remove window (a mistake), or the manager at any time. */
export async function removePhoto(input: { photoId: Uuid; userId: Uuid }): Promise<Photo> {
  const actor = requireUser(input.userId)
  const photo = db.photos.find((p) => p.id === input.photoId)
  if (!photo) throw new Error(`Unknown photo ${input.photoId}`)
  if (photo.removed_at !== null) return copy(photo)
  const now = serverNow()
  const own = photo.user_id === actor.id && canRemoveOwnPhoto(photo.uploaded_at, now, db.settings)
  if (!own && !roleOf(actor).can_correct_attendance) {
    throw new Error(`Photos can be removed for ${db.settings.photo_remove_window_min} minutes after adding them`)
  }
  photo.removed_at = now
  photo.removed_by = actor.id
  await deleteFile(photo.storage_path)
  return copy(photo)
}
