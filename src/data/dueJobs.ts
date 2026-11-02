// Trial mode's stand-in for the scheduled job (private.close_forgotten_sessions(), run by pg_cron in the live
// app): a session still open auto_close_after_min after its approved end is closed AT that end, with a new
// 'auto' clock-out. Run when the app starts and on each refresh, since a phone has no cron. Demo mode keeps
// its fixed mock time and seeded cases, so it never runs there.
import type { ClockEvent } from '@/types'
import { approvedShiftMinutes, assumedEnd, autoCloseDueAt, compareTs, shiftEndAt } from '@/lib/rules'
import { formatClock } from '@/lib/format'
import { effectiveTime, isVoided, openClockIn, pairedOut } from './attendance'
import { raiseFlag } from './flags'
import { db, newId, serverNow } from './store'

/** Only recent sessions, as the job: switching it on doesn't close months of old test data. */
const LOOK_BACK_MS = 2 * 86_400_000

/** The shift's end plus approved extra time, or null when unscheduled. */
function approvedEnd(clockIn: ClockEvent) {
  const shift = clockIn.shift_id ? db.shifts.find((s) => s.id === clockIn.shift_id) : undefined
  if (!shift) return null
  const extra = approvedShiftMinutes(db.extensions.filter((e) => e.shift_id === shift.id), db.settings) - db.settings.standard_shift_min
  return new Date(Date.parse(shiftEndAt(shift, db.settings)) + extra * 60_000).toISOString()
}

/** Closes every forgotten session that has come due. Returns how many it closed. */
export function closeForgottenSessions(): number {
  const now = serverNow()
  const oldest = new Date(Date.parse(now) - LOOK_BACK_MS).toISOString()
  let closed = 0
  const open = db.clockEvents.filter((e) => e.kind === 'in' && !isVoided(e.id) && pairedOut(e) === null && openClockIn(e.user_id)?.id === e.id)
  for (const clockIn of open) {
    const end = assumedEnd(effectiveTime(clockIn), approvedEnd(clockIn), db.settings)
    const due = autoCloseDueAt(end, db.settings)
    if (compareTs(due, now) > 0 || compareTs(due, oldest) < 0) continue

    // Carly hears about it even if nothing raised the missing clock-out flag yet.
    if (!db.flags.some((f) => f.clock_event_id === clockIn.id && f.kind === 'missing_clock_out')) {
      const by = new Date(Date.parse(end) + db.settings.missing_out_after_min * 60_000).toISOString()
      raiseFlag({ kind: 'missing_clock_out', user_id: clockIn.user_id, shift_id: clockIn.shift_id, clock_event_id: clockIn.id, detail: `No clock-out by ${formatClock(by, db.settings.timezone)}` })
    }
    db.clockEvents.push({
      id: newId('ce'),
      user_id: clockIn.user_id,
      shift_id: clockIn.shift_id,
      kind: 'out',
      server_time: now,
      location_status: 'unavailable',
      lat: null,
      lng: null,
      accuracy_m: null,
      distance_m: null,
      source: 'auto',
      assumed_time: end,
    })
    closed += 1
  }
  return closed
}
