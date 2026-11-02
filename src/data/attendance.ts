// Derived attendance: effective (corrected) times, worked minutes and fortnightly hours.
// Hours are clock-out minus clock-in using the latest correction where one exists.
// Nothing here ever cuts time: over-length shifts are reported in full and flagged elsewhere.
// Voided events (clock_voids) don't count anywhere: not in sessions, hours, the export or the home screen.
// Sessions pair the way the database does (12_attendance_fixes.sql): a clock-in with the person's next
// counting event, when that is a clock-out.
import type { ClockEvent, ClockVoid, DateString, Shift, Timestamp, Uuid } from '@/types'
import { addDays, compareTs, isOverWithoutExtension, localDate, minutesBetween } from '@/lib/rules'
import { copy, db } from './store'

export interface EffectiveClockEvent extends ClockEvent {
  /** Latest correction's new_time, else the time the job assumed, else the original server_time. */
  effective_time: Timestamp
  corrected: boolean
  /** Set when the event no longer counts. */
  voided: ClockVoid | null
}

export interface AttendanceSession {
  user_id: Uuid
  /** null = unscheduled session. */
  shift_id: Uuid | null
  clock_in: EffectiveClockEvent | null
  clock_out: EffectiveClockEvent | null
  /** null while the session is still open (or has no clock-in). */
  worked_min: number | null
  over_without_extension: boolean
}

/** A session Carly voided: kept for the record ("Show voided"), counted nowhere. */
export interface VoidedSession {
  user_id: Uuid
  shift_id: Uuid | null
  clock_in: EffectiveClockEvent
  clock_out: EffectiveClockEvent | null
  void: ClockVoid
  worked_min: number | null
}

export interface FortnightHours {
  user_id: Uuid
  full_name: string
  rostered_min: number
  unscheduled_min: number
  total_min: number
  total_hours: number
  /** Sessions with no clock-out yet — not counted until closed or corrected. */
  open_sessions: number
}

export function effectiveTime(event: ClockEvent): Timestamp {
  const latest = db.corrections
    .filter((c) => c.clock_event_id === event.id)
    .sort((a, b) => compareTs(a.created_at, b.created_at))
    .at(-1)
  return latest?.new_time ?? event.assumed_time ?? event.server_time
}

export const voidOf = (eventId: Uuid): ClockVoid | null => db.clockVoids.find((v) => v.clock_event_id === eventId) ?? null
export const isVoided = (eventId: Uuid): boolean => voidOf(eventId) !== null

function withEffective(event: ClockEvent): EffectiveClockEvent {
  const effective_time = effectiveTime(event)
  return { ...event, effective_time, corrected: db.corrections.some((c) => c.clock_event_id === event.id), voided: voidOf(event.id) }
}

/** A person's events that still count, in the order the server recorded them. */
function countingEvents(userId: Uuid): ClockEvent[] {
  return db.clockEvents.filter((e) => e.user_id === userId && !isVoided(e.id)).sort((a, b) => compareTs(a.server_time, b.server_time))
}

/** The person's open clock-in: their latest counting event, when it is an 'in'. */
export function openClockIn(userId: Uuid): ClockEvent | null {
  const last = countingEvents(userId).at(-1)
  return last?.kind === 'in' ? last : null
}

/** The clock-out that closed a clock-in: the next counting event, when it is an 'out'. */
export function pairedOut(clockIn: ClockEvent): ClockEvent | null {
  const next = countingEvents(clockIn.user_id).find((e) => compareTs(e.server_time, clockIn.server_time) > 0)
  return next?.kind === 'out' ? next : null
}

/** The clock-in a clock-out closed: the previous counting event, when it is an 'in'. */
export function pairedIn(clockOut: ClockEvent): ClockEvent | null {
  const prev = countingEvents(clockOut.user_id).findLast((e) => compareTs(e.server_time, clockOut.server_time) < 0)
  return prev?.kind === 'in' ? prev : null
}

/** A void request still waiting on this clock-in: it doesn't hold its shift meanwhile (as clock_in() links). */
export const hasPendingVoid = (eventId: Uuid): boolean =>
  db.correctionRequests.some((r) => r.clock_event_id === eventId && r.kind === 'void' && r.status === 'pending')

function buildSession(user_id: Uuid, shift_id: Uuid | null, clockIn: ClockEvent | null, clockOut: ClockEvent | null): AttendanceSession {
  const clock_in = clockIn && withEffective(clockIn)
  const clock_out = clockOut && withEffective(clockOut)
  const worked_min = clock_in && clock_out ? minutesBetween(clock_in.effective_time, clock_out.effective_time) : null
  const shiftExtensions = db.extensions.filter((e) => shift_id !== null && e.shift_id === shift_id)
  return {
    user_id,
    shift_id,
    clock_in,
    clock_out,
    worked_min,
    over_without_extension: worked_min !== null && shift_id !== null && isOverWithoutExtension(worked_min, shiftExtensions, db.settings),
  }
}

/** Every counting session of everyone: each clock-in with the clock-out that closed it (or none yet). */
function allSessions(): AttendanceSession[] {
  const sessions: AttendanceSession[] = []
  for (const userId of new Set(db.clockEvents.map((e) => e.user_id))) {
    let open: ClockEvent | null = null
    for (const e of countingEvents(userId)) {
      if (e.kind === 'in') {
        if (open) sessions.push(buildSession(userId, open.shift_id, open, null))
        open = e
      } else {
        sessions.push(buildSession(userId, open?.shift_id ?? e.shift_id, open, e))
        open = null
      }
    }
    if (open) sessions.push(buildSession(userId, open.shift_id, open, null))
  }
  return sessions
}

/** All counting sessions on a rostered shift, oldest first. */
export function shiftSessions(shift: Shift): AttendanceSession[] {
  return allSessions()
    .filter((s) => s.shift_id === shift.id)
    .sort((a, b) => compareTs((a.clock_in ?? a.clock_out)!.server_time, (b.clock_in ?? b.clock_out)!.server_time))
}

/**
 * Attendance for one rostered shift: the session whose clock-in holds the shift (the first one not waiting
 * on a void request). An empty session when nobody has clocked in.
 */
export function shiftSession(shift: Shift): AttendanceSession {
  const sessions = shiftSessions(shift)
  return sessions.find((s) => s.clock_in && !hasPendingVoid(s.clock_in.id)) ?? sessions[0] ?? buildSession(shift.assigned_user_id, shift.id, null, null)
}

export async function getShiftAttendance(shiftId: Uuid): Promise<AttendanceSession | null> {
  const shift = db.shifts.find((s) => s.id === shiftId)
  return shift ? copy(shiftSession(shift)) : null
}

/** Effective (corrected) view of clock events — the original rows are never changed. Voided ones only when asked. */
export async function getEffectiveClockEvents(filter: { userId?: Uuid; shiftId?: Uuid; includeVoided?: boolean } = {}): Promise<EffectiveClockEvent[]> {
  return copy(
    db.clockEvents
      .filter(
        (e) =>
          (filter.userId === undefined || e.user_id === filter.userId) &&
          (filter.shiftId === undefined || e.shift_id === filter.shiftId) &&
          (filter.includeVoided || !isVoided(e.id)),
      )
      .map(withEffective)
      .sort((a, b) => compareTs(a.effective_time, b.effective_time)),
  )
}

/** Voided sessions (the clock-in, and the clock-out voided with it), oldest first. */
export function voidedSessions(filter: { userId?: Uuid; shiftId?: Uuid } = {}): VoidedSession[] {
  const sessions: VoidedSession[] = []
  for (const clockIn of db.clockEvents) {
    const v = voidOf(clockIn.id)
    if (!v || clockIn.kind !== 'in') continue
    if (filter.userId !== undefined && clockIn.user_id !== filter.userId) continue
    if (filter.shiftId !== undefined && clockIn.shift_id !== filter.shiftId) continue
    const next = db.clockEvents
      .filter((e) => e.user_id === clockIn.user_id && compareTs(e.server_time, clockIn.server_time) > 0)
      .sort((a, b) => compareTs(a.server_time, b.server_time))[0]
    const clockOut = next?.kind === 'out' && isVoided(next.id) ? next : null
    const clock_in = withEffective(clockIn)
    const clock_out = clockOut && withEffective(clockOut)
    sessions.push({
      user_id: clockIn.user_id,
      shift_id: clockIn.shift_id,
      clock_in,
      clock_out,
      void: v,
      worked_min: clock_out ? minutesBetween(clock_in.effective_time, clock_out.effective_time) : null,
    })
  }
  return sessions.sort((a, b) => compareTs(a.clock_in.server_time, b.clock_in.server_time))
}

/**
 * Hours per person for a fortnight (CSV export source). Uses corrected times, includes
 * unscheduled sessions, leaves out voided ones and never truncates — exported totals equal the sum of
 * shift durations shown.
 */
export async function getFortnightHours(fortnightStart: DateString): Promise<FortnightHours[]> {
  const end = addDays(fortnightStart, 13)
  const inRange = (s: AttendanceSession) => {
    const start = s.clock_in?.effective_time
    if (!start) return false
    const day = localDate(start, db.settings)
    return day >= fortnightStart && day <= end
  }

  const totals = new Map<Uuid, FortnightHours>()
  const rowFor = (userId: Uuid) => {
    let row = totals.get(userId)
    if (!row) {
      const full_name = db.users.find((u) => u.id === userId)?.full_name ?? userId
      row = { user_id: userId, full_name, rostered_min: 0, unscheduled_min: 0, total_min: 0, total_hours: 0, open_sessions: 0 }
      totals.set(userId, row)
    }
    return row
  }
  for (const s of allSessions().filter(inRange)) {
    const row = rowFor(s.user_id)
    if (s.worked_min === null) {
      row.open_sessions += 1
      continue
    }
    if (s.shift_id === null) row.unscheduled_min += s.worked_min
    else row.rostered_min += s.worked_min
    row.total_min += s.worked_min
  }
  return [...totals.values()]
    .map((r) => ({ ...r, total_hours: Math.round((r.total_min / 60) * 100) / 100 }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
}
