// Clock in / clock out. clock_events is APPEND-ONLY: these functions only ever push new rows.
// Nothing here blocks: off-site, missing location and unscheduled clock-ins all save and are flagged.
import type { ClockEvent, ClockKind, Flag, LocationStatus, Timestamp, Uuid } from '@/types'
import { approvedShiftMinutes, compareTs, distanceMetres, formatMinutes, isOffSite, isOverWithoutExtension, localDate, minutesBetween } from '@/lib/rules'
import { effectiveTime } from './attendance'
import { raiseFlag } from './flags'
import { copy, db, newId, requireUser, serverNow } from './store'

/** What the phone sends: a GPS fix, or why there isn't one. Never a timestamp. */
export type ClockLocation = { lat: number; lng: number; accuracy_m: number } | { status: Exclude<LocationStatus, 'ok'> }

export interface ClockResult {
  event: ClockEvent
  flags: Flag[]
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

function appendEvent(userId: Uuid, shiftId: Uuid | null, kind: ClockKind, location: ClockLocation): { event: ClockEvent; flags: Flag[] } {
  const server_time = serverNow()
  const event: ClockEvent =
    'status' in location
      ? { id: newId('ce'), user_id: userId, shift_id: shiftId, kind, server_time, location_status: location.status, lat: null, lng: null, accuracy_m: null, distance_m: null }
      : {
          id: newId('ce'),
          user_id: userId,
          shift_id: shiftId,
          kind,
          server_time,
          location_status: 'ok',
          lat: location.lat,
          lng: location.lng,
          accuracy_m: location.accuracy_m,
          distance_m: Math.round(distanceMetres(location.lat, location.lng, db.settings.gym_lat, db.settings.gym_lng)),
        }
  db.clockEvents.push(event)

  const flags: Flag[] = []
  const base = { user_id: userId, shift_id: shiftId, clock_event_id: event.id }
  const label = kind === 'in' ? 'Clock-in' : 'Clock-out'
  if (event.location_status !== 'ok') {
    flags.push(raiseFlag({ ...base, kind: 'no_location', detail: `${label}: location ${event.location_status}` }))
  } else if (isOffSite(event.distance_m, event.accuracy_m, db.settings)) {
    flags.push(raiseFlag({ ...base, kind: 'off_site', detail: `${label} ${event.distance_m} m from gym (±${event.accuracy_m} m)` }))
  }
  return { event, flags }
}

/** The user's open clock-in (an 'in' with no later 'out'), if any. */
function openClockIn(userId: Uuid): ClockEvent | null {
  const last = db.clockEvents.filter((e) => e.user_id === userId).sort((a, b) => compareTs(a.server_time, b.server_time)).at(-1)
  return last?.kind === 'in' ? last : null
}

/** Links to the user's published shift for today (site timezone) that has no clock-in yet; otherwise unscheduled. */
export async function clockIn(userId: Uuid, location: ClockLocation): Promise<ClockResult> {
  requireUser(userId)
  const today = localDate(serverNow(), db.settings)
  const shift = db.shifts
    .filter((s) => s.assigned_user_id === userId && s.status === 'published' && s.date === today)
    .filter((s) => !db.clockEvents.some((e) => e.shift_id === s.id && e.kind === 'in'))
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0]

  const { event, flags } = appendEvent(userId, shift?.id ?? null, 'in', location)
  if (!shift) {
    flags.push(raiseFlag({ user_id: userId, shift_id: null, clock_event_id: event.id, kind: 'unscheduled', detail: 'Clock-in with no rostered shift' }))
  }
  return copy({ event, flags })
}

/** Closes the user's open session. Over-length is flagged against approved extensions — never cut. */
export async function clockOut(userId: Uuid, location: ClockLocation): Promise<ClockResult> {
  requireUser(userId)
  const open = openClockIn(userId)
  const { event, flags } = appendEvent(userId, open?.shift_id ?? null, 'out', location)

  if (open?.shift_id) {
    const worked = minutesBetween(effectiveTime(open), event.server_time)
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
