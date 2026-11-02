// Clock in / clock out. clock_events is APPEND-ONLY: these functions only ever push new rows.
// Nothing here blocks: off-site, missing location and unscheduled clock-ins all save and are flagged.
// The one refusal: a second clock-in while one is open (AlreadyClockedInError), as clock_in() in the database.
import type { ClockEvent, ClockKind, Flag, LocationStatus, Shift, Timestamp, Uuid } from '@/types'
import {
  approvedShiftMinutes,
  compareTs,
  distanceMetres,
  formatMinutes,
  isOffSite,
  isOffStart,
  isOverWithoutExtension,
  isShortSession,
  localDate,
  minutesBetween,
  minutesFromStart,
  shiftStartAt,
} from '@/lib/rules'
import { formatClock } from '@/lib/format'
import { effectiveTime, hasPendingVoid, isVoided, openClockIn } from './attendance'
import { raiseFlag } from './flags'
import { copy, db, newId, requireFreshClock, requireUser, serverNow } from './store'

/** What the phone sends: a GPS fix, or why there isn't one. Never a timestamp. */
export type ClockLocation = { lat: number; lng: number; accuracy_m: number } | { status: Exclude<LocationStatus, 'ok'> }

export interface ClockResult {
  event: ClockEvent
  flags: Flag[]
}

/** Clocking in while already clocked in. The screen offers Clock out or Cancel. */
export class AlreadyClockedInError extends Error {
  /** Effective time of the open clock-in. */
  readonly since: Timestamp
  constructor(since: Timestamp, message: string) {
    super(message)
    this.name = 'AlreadyClockedInError'
    this.since = since
  }
}

export async function getClockEvents(filter: { userId?: Uuid; shiftId?: Uuid; from?: Timestamp; to?: Timestamp } = {}): Promise<ClockEvent[]> {
  return copy(
    db.clockEvents
      .filter(
        (e) =>
          (filter.userId === undefined || e.user_id === filter.userId) &&
          (filter.shiftId === undefined || e.shift_id === filter.shiftId) &&
          (filter.from === undefined || compareTs(e.server_time, filter.from) >= 0) &&
          (filter.to === undefined || compareTs(e.server_time, filter.to) <= 0),
      )
      .sort((a, b) => compareTs(a.server_time, b.server_time)),
  )
}

/** Saves one clock event at the server time, and its location flags. Internal to src/data. */
export function appendEvent(userId: Uuid, shiftId: Uuid | null, kind: ClockKind, location: ClockLocation): { event: ClockEvent; flags: Flag[] } {
  const server_time = serverNow()
  const base = { id: newId('ce'), user_id: userId, shift_id: shiftId, kind, server_time, source: 'phone', assumed_time: null } as const
  const event: ClockEvent =
    'status' in location
      ? { ...base, location_status: location.status, lat: null, lng: null, accuracy_m: null, distance_m: null }
      : {
          ...base,
          location_status: 'ok',
          lat: location.lat,
          lng: location.lng,
          accuracy_m: location.accuracy_m,
          distance_m: Math.round(distanceMetres(location.lat, location.lng, db.settings.gym_lat, db.settings.gym_lng)),
        }
  db.clockEvents.push(event)

  const flags: Flag[] = []
  const ref = { user_id: userId, shift_id: shiftId, clock_event_id: event.id }
  const label = kind === 'in' ? 'Clock-in' : 'Clock-out'
  if (event.location_status !== 'ok') {
    flags.push(raiseFlag({ ...ref, kind: 'no_location', detail: `${label}: location ${event.location_status}` }))
  } else if (isOffSite(event.distance_m, event.accuracy_m, db.settings)) {
    flags.push(raiseFlag({ ...ref, kind: 'off_site', detail: `${label} ${event.distance_m} m from gym (±${event.accuracy_m} m)` }))
  }
  return { event, flags }
}

/** A clock-in that holds its shift: not voided, and not waiting on a void request. */
const holdsShift = (e: ClockEvent) => e.kind === 'in' && !isVoided(e.id) && !hasPendingVoid(e.id)

/** The published shift today (site timezone) a clock-in now would link to: the earliest with no clock-in holding it. */
export function shiftToLink(userId: Uuid, now: Timestamp): Shift | undefined {
  const today = localDate(now, db.settings)
  return db.shifts
    .filter((s) => s.assigned_user_id === userId && s.status === 'published' && s.date === today)
    .filter((s) => !db.clockEvents.some((e) => e.shift_id === s.id && holdsShift(e)))
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0]
}

/** Links to the user's shift for today with no clock-in holding it; otherwise unscheduled. Never a second open clock-in. */
export async function clockIn(userId: Uuid, location: ClockLocation): Promise<ClockResult> {
  requireUser(userId)
  await requireFreshClock()
  const open = openClockIn(userId)
  if (open) {
    const since = effectiveTime(open)
    throw new AlreadyClockedInError(since, `You're already clocked in since ${formatClock(since, db.settings.timezone)}`)
  }
  const shift = shiftToLink(userId, serverNow())

  const { event, flags } = appendEvent(userId, shift?.id ?? null, 'in', location)
  if (!shift) {
    flags.push(raiseFlag({ user_id: userId, shift_id: null, clock_event_id: event.id, kind: 'unscheduled', detail: 'Clock-in with no rostered shift' }))
  } else {
    // Far from the rostered start, early or late: flag only.
    const start = shiftStartAt(shift, db.settings)
    if (isOffStart(event.server_time, start, db.settings)) {
      const off = minutesFromStart(event.server_time, start)
      const detail = `Clock-in ${formatMinutes(Math.abs(off))} ${off < 0 ? 'before' : 'after'} the ${formatClock(start, db.settings.timezone)} start`
      flags.push(raiseFlag({ user_id: userId, shift_id: shift.id, clock_event_id: event.id, kind: 'off_start', detail }))
    }
  }
  return copy({ event, flags })
}

/** Closes the user's open session. Over-length and a session of a minute or two are flagged — never cut. */
export async function clockOut(userId: Uuid, location: ClockLocation): Promise<ClockResult> {
  requireUser(userId)
  await requireFreshClock()
  const open = openClockIn(userId)
  const { event, flags } = appendEvent(userId, open?.shift_id ?? null, 'out', location)
  if (!open) return copy({ event, flags })

  const worked = minutesBetween(effectiveTime(open), event.server_time)
  if (isShortSession(worked, db.settings)) {
    flags.push(raiseFlag({ user_id: userId, shift_id: open.shift_id, clock_event_id: event.id, kind: 'short_session', detail: `Clocked out ${worked} min after clocking in` }))
  }
  if (open.shift_id) {
    const shiftExtensions = db.extensions.filter((e) => e.shift_id === open.shift_id)
    if (isOverWithoutExtension(worked, shiftExtensions, db.settings)) {
      flags.push(
        raiseFlag({
          user_id: userId,
          shift_id: open.shift_id,
          clock_event_id: event.id,
          kind: 'over_without_extension',
          detail: `Recorded ${formatMinutes(worked)}; approved ${formatMinutes(approvedShiftMinutes(shiftExtensions, db.settings))}`,
        }),
      )
    }
  }
  return copy({ event, flags })
}
