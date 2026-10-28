// Derived attendance: effective (corrected) times, worked minutes and fortnightly hours.
// Hours are clock-out minus clock-in using the latest correction where one exists.
// Nothing here ever cuts time: over-length shifts are reported in full and flagged elsewhere.
import type { ClockEvent, DateString, Shift, Timestamp, Uuid } from '@/types'
import { addDays, compareTs, isOverWithoutExtension, localDate, minutesBetween } from '@/lib/rules'
import { copy, db } from './store'

export interface EffectiveClockEvent extends ClockEvent {
  /** Latest correction's new_time, else the original server_time. */
  effective_time: Timestamp
  corrected: boolean
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
  return latest?.new_time ?? event.server_time
}

function withEffective(event: ClockEvent): EffectiveClockEvent {
  const effective_time = effectiveTime(event)
  return { ...event, effective_time, corrected: effective_time !== event.server_time }
}

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

/** Attendance for one rostered shift: first clock-in and last clock-out linked to it. */
export function shiftSession(shift: Shift): AttendanceSession {
  const events = db.clockEvents.filter((e) => e.shift_id === shift.id).sort((a, b) => compareTs(a.server_time, b.server_time))
  const clockIn = events.find((e) => e.kind === 'in') ?? null
  const clockOut = events.filter((e) => e.kind === 'out').at(-1) ?? null
  return buildSession(shift.assigned_user_id, shift.id, clockIn, clockOut)
}

/** Unscheduled sessions: each unlinked clock-in paired with the user's next unlinked clock-out. */
function unscheduledSessions(): AttendanceSession[] {
  const sessions: AttendanceSession[] = []
  const unlinked = db.clockEvents.filter((e) => e.shift_id === null).sort((a, b) => compareTs(a.server_time, b.server_time))
  const open = new Map<Uuid, ClockEvent>()
  for (const e of unlinked) {
    if (e.kind === 'in') {
      const prev = open.get(e.user_id)
      if (prev) sessions.push(buildSession(e.user_id, null, prev, null))
      open.set(e.user_id, e)
    } else {
      sessions.push(buildSession(e.user_id, null, open.get(e.user_id) ?? null, e))
      open.delete(e.user_id)
    }
  }
  for (const [userId, e] of open) sessions.push(buildSession(userId, null, e, null))
  return sessions
}

export async function getShiftAttendance(shiftId: Uuid): Promise<AttendanceSession | null> {
  const shift = db.shifts.find((s) => s.id === shiftId)
  return shift ? copy(shiftSession(shift)) : null
}

/** Effective (corrected) view of clock events — the original rows are never changed. */
export async function getEffectiveClockEvents(filter: { userId?: Uuid; shiftId?: Uuid } = {}): Promise<EffectiveClockEvent[]> {
  return copy(
    db.clockEvents
      .filter((e) => (filter.userId === undefined || e.user_id === filter.userId) && (filter.shiftId === undefined || e.shift_id === filter.shiftId))
      .map(withEffective)
      .sort((a, b) => compareTs(a.effective_time, b.effective_time)),
  )
}

/**
 * Hours per person for a fortnight (CSV export source). Uses corrected times, includes
 * unscheduled sessions, and never truncates — exported totals equal the sum of shift durations shown.
 */
export async function getFortnightHours(fortnightStart: DateString): Promise<FortnightHours[]> {
  const end = addDays(fortnightStart, 13)
  const inRange = (s: AttendanceSession) => {
    const start = s.clock_in?.effective_time
    if (!start) return false
    const day = localDate(start, db.settings)
    return day >= fortnightStart && day <= end
  }
  const rostered = db.shifts.filter((s) => s.status === 'published').map(shiftSession).filter(inRange)
  const unscheduled = unscheduledSessions().filter(inRange)

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
  for (const s of [...rostered, ...unscheduled]) {
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
