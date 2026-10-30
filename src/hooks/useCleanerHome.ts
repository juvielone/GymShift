// Loads everything the cleaner home screen shows and derives which phase of the day they are in.
// Reads only through '@/data'; the time always comes from the server clock, never the phone.
import { useCallback, useEffect, useState } from 'react'
import {
  getCurrentUser,
  getEffectiveClockEvents,
  getExtensions,
  getNotes,
  getPhotos,
  getSettings,
  getShiftAttendance,
  getShifts,
  getUpcomingShifts,
  serverNow,
} from '@/data'
import type { EffectiveClockEvent } from '@/data'
import type { Extension, Note, Photo, Shift, SiteSettings, Timestamp, User } from '@/types'
import { approvedShiftMinutes, compareTs, localDate, minutesBetween } from '@/lib/rules'
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
  /** Shown work photos on that shift, oldest first. */
  photos: Photo[]
  /** This person's notes on that shift, newest first. */
  notes: Note[]
}

async function loadHome(): Promise<CleanerHome> {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()])
  const now = serverNow()
  const today = localDate(now, settings)

  const [todayShifts, events, upcomingAll, permission] = await Promise.all([
    getShifts({ userId: user.id, status: 'published', from: today, to: today }),
    getEffectiveClockEvents({ userId: user.id }),
    getUpcomingShifts(user.id, 8),
    getLocationPermission(),
  ])

  const buildSession = async (shift: Shift | null, clockIn: EffectiveClockEvent, clockOut: EffectiveClockEvent | null): Promise<Session> => {
    const extensions = shift ? await getExtensions({ shiftId: shift.id }) : []
    return {
      shift,
      clockIn,
      clockOut,
      workedMin: minutesBetween(clockIn.effective_time, clockOut?.effective_time ?? now),
      extensions,
      approvedMin: approvedShiftMinutes(extensions, settings),
    }
  }

  // An open clock-in wins: the most recent event being an 'in' means they're on the clock now.
  const last = events.at(-1)
  let phase: HomePhase | null = null
  if (last?.kind === 'in') {
    const shift = last.shift_id ? (todayShifts.find((s) => s.id === last.shift_id) ?? null) : null
    phase = { kind: 'on', session: await buildSession(shift, last, null) }
  }

  let lastDone: Session | null = null
  const doneIds = new Set<string>()
  for (const shift of todayShifts) {
    const att = await getShiftAttendance(shift.id)
    if (att?.clock_in && att.clock_out) {
      doneIds.add(shift.id)
      lastDone = await buildSession(shift, att.clock_in, att.clock_out)
    } else if (!phase && !att?.clock_in) {
      phase = { kind: 'before', shift }
    }
  }
  if (!phase) {
    // A just-finished unscheduled session today still counts as "done" for the screen.
    const lastOut = last?.kind === 'out' && localDate(last.effective_time, settings) === today ? last : null
    const lastIn = lastOut ? events.findLast((e) => e.kind === 'in' && compareTs(e.effective_time, lastOut.effective_time) <= 0) : undefined
    if (!lastDone && lastOut && lastIn && lastIn.shift_id === null) lastDone = await buildSession(null, lastIn, lastOut)
    phase = lastDone ? { kind: 'done', session: lastDone } : { kind: 'no_shift', lastDone: null }
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
  const [photos, notes] = recordShift
    ? await Promise.all([getPhotos({ shiftId: recordShift.id }), getNotes({ shiftId: recordShift.id, userId: user.id })])
    : [[], []]

  return { user, settings, now, phase, upcoming, locationAccess, recordShift, photos, notes }
}

/** Refreshes every 30 s so worked time and the progress line keep up with the server clock. */
export function useCleanerHome() {
  const [data, setData] = useState<CleanerHome | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
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
