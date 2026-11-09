// Loads everything the cleaner home screen shows and derives which phase of the day they are in.
// Reads only through '@/data'; the time always comes from the server clock, never the phone.
import { useCallback, useEffect, useState } from 'react'
import {
  getCorrectionRequests,
  getCurrentUser,
  getEffectiveClockEvents,
  getExtensions,
  getNotes,
  getPhotos,
  getSettings,
  getShift,
  getShiftAttendance,
  getShifts,
  getUpcomingShifts,
  refreshData,
  serverNow,
} from '@/data'
import type { EffectiveClockEvent, PhotoTarget } from '@/data'
import type { CorrectionRequest, Extension, Note, Photo, Shift, SiteSettings, Timestamp, User } from '@/types'
import { approvedShiftMinutes, compareTs, localDate, minutesBetween, photoWindowClosesAt, photoWindowStart } from '@/lib/rules'
import { getLocationPermission } from '@/lib/geolocation'

/** What to tell the cleaner about location before they tap. 'unknown' keeps the plain text. */
export type LocationAccess = 'blocked' | 'ask' | 'ok' | 'unknown'

export type HomePhase =
  /** No rostered shift left today and nothing open. */
  | { kind: 'no_shift'; lastDone: Session | null }
  /** A rostered shift today that hasn't been clocked into yet. */
  | { kind: 'before'; shift: Shift }
  /** Clocked in (rostered or unscheduled) and not yet out. */
  | { kind: 'on'; session: Session }
  /** Today's shift is clocked in and out. */
  | { kind: 'done'; session: Session }

export interface Session {
  /** null = unscheduled. */
  shift: Shift | null
  clockIn: EffectiveClockEvent
  clockOut: EffectiveClockEvent | null
  workedMin: number
  extensions: Extension[]
  /** Standard length plus approved extra time, never beyond the maximum. */
  approvedMin: number
  /** The latest "This was a mistake" on the clock-in, if asked. */
  voidRequest: CorrectionRequest | null
  /** The latest "When did you finish?" on the clock-out, if asked. */
  endRequest: CorrectionRequest | null
}

/** What happened to a "This was a mistake" today, for the row that answers it. */
export interface VoidNotice {
  request: CorrectionRequest
  /** When the clock-in it is about was made. */
  clockInAt: Timestamp
}

export interface CleanerHome {
  user: User
  settings: SiteSettings
  now: Timestamp
  phase: HomePhase
  upcoming: Shift[]
  locationAccess: LocationAccess
  /** The rostered shift photos and notes attach to (today's, before, during or after it). null = none. */
  recordShift: Shift | null
  /** Shown work photos on that shift (or on the session off the roster), oldest first. */
  photos: Photo[]
  /** This person's notes on that shift, newest first. */
  notes: Note[]
  /** Today's latest "This was a mistake" and what Carly did with it. null = none today. */
  voidNotice: VoidNotice | null
  /** The latest session the job closed for them that they haven't answered yet, with its shift's photos. */
  autoClosed: { session: Session; photos: Photo[] } | null
}

/** Where a session's photos go: its rostered shift, or its clock-in when worked off the roster. */
export const photoTargetOf = (session: Session): PhotoTarget => (session.shift ? { shiftId: session.shift.id } : { clockInId: session.clockIn.id })

async function loadHome(): Promise<CleanerHome> {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()])
  const now = serverNow()
  const today = localDate(now, settings)

  const [todayShifts, allEvents, upcomingAll, permission, requests] = await Promise.all([
    getShifts({ userId: user.id, status: 'published', from: today, to: today }),
    getEffectiveClockEvents({ userId: user.id, includeVoided: true }),
    getUpcomingShifts(user.id, 8),
    getLocationPermission(),
    getCorrectionRequests({ userId: user.id }),
  ])
  // Voided events count nowhere: after a void they're back to "not clocked in".
  const events = allEvents.filter((e) => !e.voided)

  /** The latest request of that kind on an event (requests come oldest first). */
  const requestOn = (eventId: string, kind: CorrectionRequest['kind']) => requests.filter((r) => r.clock_event_id === eventId && r.kind === kind).at(-1) ?? null
  // A clock-in waiting on "This was a mistake" doesn't hold the shift: they can clock in properly meanwhile.
  const setAside = (e: EffectiveClockEvent) => requestOn(e.id, 'void')?.status === 'pending'

  const buildSession = async (shift: Shift | null, clockIn: EffectiveClockEvent, clockOut: EffectiveClockEvent | null): Promise<Session> => {
    const extensions = shift ? await getExtensions({ shiftId: shift.id }) : []
    return {
      shift,
      clockIn,
      clockOut,
      workedMin: minutesBetween(clockIn.effective_time, clockOut?.effective_time ?? now),
      extensions,
      approvedMin: approvedShiftMinutes(extensions, settings),
      voidRequest: requestOn(clockIn.id, 'void'),
      endRequest: clockOut ? requestOn(clockOut.id, 'end_time') : null,
    }
  }

  // The shift a clock-in is linked to, whatever day it is rostered on: a night shift runs past midnight,
  // so after 12:00 am it is no longer among today's shifts.
  const linkedShift = async (e: EffectiveClockEvent) =>
    e.shift_id ? (todayShifts.find((s) => s.id === e.shift_id) ?? (await getShift(e.shift_id))) : null

  // An open clock-in wins: the most recent event being an 'in' means they're on the clock now.
  const last = events.at(-1)
  let phase: HomePhase | null = null
  if (last?.kind === 'in') {
    phase = { kind: 'on', session: await buildSession(await linkedShift(last), last, null) }
  }

  let lastDone: Session | null = null
  const doneIds = new Set<string>()
  for (const shift of todayShifts) {
    const att = await getShiftAttendance(shift.id)
    const clockIn = att?.clock_in && !setAside(att.clock_in) ? att.clock_in : null
    if (clockIn && att?.clock_out) {
      doneIds.add(shift.id)
      lastDone = await buildSession(shift, clockIn, att.clock_out)
    } else if (!phase && !clockIn) {
      phase = { kind: 'before', shift }
    }
  }
  if (!phase) {
    // A session that finished today still counts as "done" for the screen: an unscheduled one, or a night
    // shift rostered yesterday that ran past midnight. So does one whose photo window is still open, so a
    // night shift's photos row doesn't vanish at midnight.
    const photosStillDue = (out: EffectiveClockEvent) =>
      compareTs(now, photoWindowClosesAt(photoWindowStart(out, requestOn(out.id, 'end_time')?.created_at ?? null), settings) ?? now) < 0
    const lastOut = last?.kind === 'out' && (localDate(last.effective_time, settings) === today || photosStillDue(last)) ? last : null
    const lastIn = lastOut ? events.findLast((e) => e.kind === 'in' && compareTs(e.effective_time, lastOut.effective_time) <= 0) : undefined
    const fromToday = lastIn?.shift_id != null && todayShifts.some((s) => s.id === lastIn.shift_id)
    if (!lastDone && lastOut && lastIn && !fromToday && !setAside(lastIn)) lastDone = await buildSession(await linkedShift(lastIn), lastIn, lastOut)
    phase = lastDone ? { kind: 'done', session: lastDone } : { kind: 'no_shift', lastDone: null }
  }

  // Today's latest "This was a mistake", asked or answered today.
  const touched = (r: CorrectionRequest) => (r.decided_at && compareTs(r.decided_at, r.created_at) > 0 ? r.decided_at : r.created_at)
  const todayVoid = requests
    .filter((r) => r.kind === 'void' && localDate(touched(r), settings) === today)
    .sort((a, b) => compareTs(touched(a), touched(b)))
    .at(-1)
  const voidedIn = todayVoid && allEvents.find((e) => e.id === todayVoid.clock_event_id)
  const voidNotice = todayVoid && voidedIn ? { request: todayVoid, clockInAt: voidedIn.effective_time } : null

  // The latest session the job closed that they haven't answered: "Is 10:00 pm right?"
  const autoOut = events.findLast((e) => e.kind === 'out' && e.source === 'auto' && !requests.some((r) => r.clock_event_id === e.id))
  const autoIn = autoOut && events.findLast((e) => e.kind === 'in' && compareTs(e.server_time, autoOut.server_time) < 0)
  let autoClosed: CleanerHome['autoClosed'] = null
  if (autoOut && autoIn) {
    const autoShift = autoOut.shift_id ? ((await getShifts({ userId: user.id })).find((s) => s.id === autoOut.shift_id) ?? null) : null
    autoClosed = {
      session: await buildSession(autoShift, autoIn, autoOut),
      photos: await getPhotos(autoShift ? { shiftId: autoShift.id } : { clockInId: autoIn.id }),
    }
  }

  const shownId = phase.kind === 'before' ? phase.shift.id : phase.kind === 'on' || phase.kind === 'done' ? phase.session.shift?.id : undefined
  const upcoming = upcomingAll.filter((s) => s.id !== shownId && !doneIds.has(s.id))

  // Without the Permissions API, a last clock event that was denied is the best sign it's still blocked.
  const locationAccess: LocationAccess =
    permission === 'denied'
      ? 'blocked'
      : permission === 'prompt'
        ? 'ask'
        : permission === 'granted'
          ? 'ok'
          : last?.location_status === 'denied'
            ? 'blocked'
            : 'unknown'

  const recordShift = phase.kind === 'before' ? phase.shift : phase.kind === 'no_shift' ? null : phase.session.shift
  // Off the roster, photos hang on the clock-in (there's no shift for notes).
  const offRoster = (phase.kind === 'on' || phase.kind === 'done') && !phase.session.shift ? phase.session : null
  const [photos, notes] = recordShift
    ? await Promise.all([getPhotos({ shiftId: recordShift.id }), getNotes({ shiftId: recordShift.id, userId: user.id })])
    : [offRoster ? await getPhotos({ clockInId: offRoster.clockIn.id }) : [], []]

  return { user, settings, now, phase, upcoming, locationAccess, recordShift, photos, notes, voidNotice, autoClosed }
}

/** Refreshes every 30 s so worked time and the progress line keep up with the server clock. */
export function useCleanerHome() {
  const [data, setData] = useState<CleanerHome | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      await refreshData()
      setData(await loadHome())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 30_000)
    return () => clearInterval(id)
  }, [refresh])

  return { data, error, refresh }
}
