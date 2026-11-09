// Shift records: one shift's attendance, photos, notes and flags put together, for Carly's
// shift sheet and records screen, Gladys's group, and a cleaner's "My past shifts".
// Who may see a record mirrors the planned RLS on photos/notes/hours: the role's view_records_scope
// (manager all, team lead own group, cleaner own).
// Time worked off the roster (an unscheduled clock-in) is a record too, with no shift: it is paid like any
// other, so it stays visible after Carly resolves its "not rostered" flag. Its photos hang on the clock-in; it
// has no notes or extensions.
import type { CorrectionRequest, DateString, Extension, Flag, Note, Photo, Shift, Timestamp, User, Uuid } from '@/types'
import { approvedShiftMinutes, compareTs, localDate } from '@/lib/rules'
import { zonedTimestamp } from '@/lib/format'
import { isVoided, shiftSession, shiftSessions, unscheduledSessions, voidedSessions, type AttendanceSession, type ClockedSession, type VoidedSession } from './attendance'
import { canActOn, copy, db, requireUser, roleOf, serverNow } from './store'

export interface ShiftRecord {
  /** The shift's id, or the clock-in's id for time off the roster. */
  id: Uuid
  /** The shift's date, or the local date of the clock-in off the roster. */
  date: DateString
  /** When it started, for ordering: the rostered start, or the clock-in. */
  starts_at: Timestamp
  /** null = worked off the roster (an unscheduled clock-in). */
  shift: Shift | null
  /** The assignee: hours, photos and notes on a shift belong to them. */
  user: User
  session: AttendanceSession
  /** Other counting sessions on the shift (e.g. a clock-in Carly kept after a void request), oldest first. */
  other_sessions: AttendanceSession[]
  /** Voided sessions, for "Show voided". They count nowhere. */
  voided: VoidedSession[]
  /** Requests about this shift's clock events (void and end time), oldest first. */
  requests: CorrectionRequest[]
  /** Extension requests on the shift, oldest first (after the fact ones too). */
  extensions: Extension[]
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
  const session = shiftSession(shift)
  const eventIds = new Set(db.clockEvents.filter((e) => e.shift_id === shift.id).map((e) => e.id))
  return {
    id: shift.id,
    date: shift.date,
    starts_at: zonedTimestamp(shift.date, shift.start_time, db.settings.timezone),
    shift,
    user: requireUser(shift.assigned_user_id),
    session,
    other_sessions: shiftSessions(shift).filter((s) => s.clock_in?.id !== session.clock_in?.id || s.clock_out?.id !== session.clock_out?.id),
    voided: voidedSessions({ shiftId: shift.id }),
    requests: byOldest(
      db.correctionRequests.filter((r) => eventIds.has(r.clock_event_id)),
      (r) => r.created_at,
    ),
    extensions: byOldest(
      db.extensions.filter((e) => e.shift_id === shift.id),
      (e) => e.created_at,
    ),
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

/** Time off the roster: one counting session with no shift, keyed by its clock-in. */
function buildUnscheduled(session: ClockedSession): ShiftRecord {
  const eventIds = new Set([session.clock_in.id, ...(session.clock_out ? [session.clock_out.id] : [])])
  return {
    id: session.clock_in.id,
    date: localDate(session.clock_in.effective_time, db.settings),
    starts_at: session.clock_in.effective_time,
    shift: null,
    user: requireUser(session.user_id),
    session,
    other_sessions: [],
    voided: [],
    requests: db.correctionRequests.filter((r) => eventIds.has(r.clock_event_id)).sort((a, b) => compareTs(a.created_at, b.created_at)),
    extensions: [],
    approved_min: db.settings.standard_shift_min,
    photos: db.photos
      .filter((p) => p.clock_event_id === session.clock_in.id && p.removed_at === null)
      .sort((a, b) => compareTs(a.uploaded_at, b.uploaded_at)),
    notes: [],
    flags: db.flags
      .filter((f) => f.shift_id === null && f.clock_event_id !== null && eventIds.has(f.clock_event_id))
      .sort((a, b) => compareTs(a.created_at, b.created_at)),
  }
}

/** One record, if the viewer may see it: a shift's id, or the clock-in's id for time off the roster. */
export async function getShiftRecord(input: { recordId: Uuid; viewerId: Uuid }): Promise<ShiftRecord | null> {
  const viewer = requireUser(input.viewerId)
  const shift = db.shifts.find((s) => s.id === input.recordId)
  if (shift) return canView(viewer, shift.assigned_user_id) ? copy(build(shift)) : null
  const session = unscheduledSessions().find((s) => s.clock_in.id === input.recordId)
  return session && canView(viewer, session.user_id) ? copy(buildUnscheduled(session)) : null
}

/** Time off the roster today, and any still open from before (a night that ran past midnight), oldest first. */
export async function getUnscheduledToday(viewerId: Uuid): Promise<ShiftRecord[]> {
  const viewer = requireUser(viewerId)
  const today = localDate(serverNow(), db.settings)
  return copy(
    unscheduledSessions()
      .filter((s) => canView(viewer, s.user_id) && (localDate(s.clock_in.effective_time, db.settings) === today || s.clock_out === null))
      .map(buildUnscheduled),
  )
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
      (compareTs(zonedTimestamp(s.date, s.start_time, db.settings.timezone), now) <= 0 || db.clockEvents.some((e) => e.shift_id === s.id && !isVoided(e.id))),
  )
  const offRoster = unscheduledSessions().filter((s) => {
    const day = localDate(s.clock_in.effective_time, db.settings)
    return day >= input.from && day <= input.to && (input.userId === undefined || s.user_id === input.userId) && canView(viewer, s.user_id)
  })
  return copy([...shifts.map(build), ...offRoster.map(buildUnscheduled)].sort((a, b) => compareTs(b.starts_at, a.starts_at)))
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
