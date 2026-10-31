// Shift records: one shift's attendance, photos, notes and flags put together, for Carly's
// shift sheet and records screen, Gladys's group, and a cleaner's "My past shifts".
// Who may see a record mirrors the planned RLS on photos/notes/hours: the role's view_records_scope
// (manager all, team lead own group, cleaner own).
import type { DateString, Flag, Note, Photo, Shift, Timestamp, User, Uuid } from '@/types'
import { approvedShiftMinutes, compareTs } from '@/lib/rules'
import { zonedTimestamp } from '@/lib/format'
import { shiftSession, type AttendanceSession } from './attendance'
import { canActOn, copy, db, requireUser, roleOf, serverNow } from './store'

export interface ShiftRecord {
  shift: Shift
  /** The assignee: hours, photos and notes on a shift belong to them. */
  user: User
  session: AttendanceSession
  /** Standard length plus approved extra time, never beyond the maximum. */
  approved_min: number
  /** Shown photos, oldest first. */
  photos: Photo[]
  /** Oldest first, as they were written during the shift. */
  notes: Note[]
  /** Open and resolved, oldest first. */
  flags: Flag[]
}

function canView(viewer: User, userId: Uuid): boolean {
  return canActOn(viewer, userId, roleOf(viewer).view_records_scope)
}

function build(shift: Shift): ShiftRecord {
  const byOldest = <T>(rows: T[], ts: (r: T) => Timestamp) => [...rows].sort((a, b) => compareTs(ts(a), ts(b)))
  return {
    shift,
    user: requireUser(shift.assigned_user_id),
    session: shiftSession(shift),
    approved_min: approvedShiftMinutes(
      db.extensions.filter((e) => e.shift_id === shift.id),
      db.settings,
    ),
    photos: byOldest(
      db.photos.filter((p) => p.shift_id === shift.id && p.removed_at === null),
      (p) => p.uploaded_at,
    ),
    notes: byOldest(
      db.notes.filter((n) => n.shift_id === shift.id),
      (n) => n.created_at,
    ),
    flags: byOldest(
      db.flags.filter((f) => f.shift_id === shift.id),
      (f) => f.created_at,
    ),
  }
}

/** One shift, if the viewer may see its records. */
export async function getShiftRecord(input: { shiftId: Uuid; viewerId: Uuid }): Promise<ShiftRecord | null> {
  const viewer = requireUser(input.viewerId)
  const shift = db.shifts.find((s) => s.id === input.shiftId)
  if (!shift || !canView(viewer, shift.assigned_user_id)) return null
  return copy(build(shift))
}

/**
 * Published shifts that have started (or been clocked into) between two dates, newest first,
 * limited to what the viewer may see. Shifts not reached yet belong to the roster, not the records.
 */
export async function getShiftRecords(input: { viewerId: Uuid; from: DateString; to: DateString; userId?: Uuid }): Promise<ShiftRecord[]> {
  const viewer = requireUser(input.viewerId)
  const now = serverNow()
  const shifts = db.shifts.filter(
    (s) =>
      s.status === 'published' &&
      s.date >= input.from &&
      s.date <= input.to &&
      (input.userId === undefined || s.assigned_user_id === input.userId) &&
      canView(viewer, s.assigned_user_id) &&
      (compareTs(zonedTimestamp(s.date, s.start_time, db.settings.timezone), now) <= 0 || db.clockEvents.some((e) => e.shift_id === s.id)),
  )
  return copy(
    shifts
      .sort((a, b) => (b.date + b.start_time).localeCompare(a.date + a.start_time))
      .map(build),
  )
}

/** People whose records the viewer may see (for the filter chips), active first by name. */
export async function getRecordPeople(viewerId: Uuid): Promise<User[]> {
  const viewer = requireUser(viewerId)
  return copy(
    db.users
      .filter((u) => u.role !== 'manager' && canView(viewer, u.id))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.full_name.localeCompare(b.full_name)),
  )
}
