// The ONLY entry point for data in the app. UI code imports from '@/data', never from '@/mocks'
// or a Supabase client. Internal helpers (store, raiseFlag, photoFiles) are deliberately not re-exported.
import * as users from './users'
import * as settings from './settings'
import * as availability from './availability'
import * as shifts from './shifts'
import * as clockEvents from './clockEvents'
import * as corrections from './corrections'
import * as attendanceFixes from './attendanceFixes'
import * as flags from './flags'
import * as extensions from './extensions'
import * as swaps from './swaps'
import * as photos from './photos'
import * as notes from './notes'
import type { Photo } from '@/types'
import { MODE, persist } from './store'
import { runDueJobs } from './trial'

type Live = typeof import('./live')

/** A write the live app can't do yet, because its database function doesn't exist yet. */
const NOT_LIVE_YET = "This isn't switched on in the live app yet."

/**
 * Every write saves the store to the phone in trial mode (a no-op in demo mode). In live mode the
 * write goes to its Supabase version (`live`), or is refused until that exists. Reads are left as they are.
 */
function persisted<A extends unknown[], R>(write: (...args: A) => Promise<R>, live?: (l: Live) => (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args) => {
    if (MODE === 'live') {
      if (!live) throw new Error(NOT_LIVE_YET)
      return live(await import('./live'))(...args)
    }
    try {
      return await write(...args)
    } finally {
      persist()
    }
  }
}

export { getCurrentUser, isSignedIn, getDemoAccounts, getUsers, getUser, getRoles, getPermissions, getStaffImpact, suggestUsername, ASSIGNABLE_ROLES, SIGN_IN_MISMATCH } from './users'
export type { StaffImpact, DemoAccount } from './users'
export const signIn = persisted(users.signIn, (l) => l.signIn)
export const setMockCurrentUser = persisted(users.setMockCurrentUser)
export const signOut = persisted(users.signOut, (l) => l.signOut)
export const createUser = persisted(users.createUser)
export const updateUser = persisted(users.updateUser)
export const resetPin = persisted(users.resetPin)
export const setUserActive = persisted(users.setUserActive)

export { getSettings, RADIUS_MIN_M, RADIUS_MAX_M } from './settings'
export const updateSiteLocation = persisted(settings.updateSiteLocation, (l) => l.updateSiteLocation)

export { getAvailability } from './availability'
export const markUnavailable = persisted(availability.markUnavailable)

export { getShifts, getShift, getUpcomingShifts, getShiftChanges, getShiftChangesForFortnight, getRosterWarnings } from './shifts'
export type { RosterWarning, RosterWarningKind } from './shifts'
export const updateShift = persisted(shifts.updateShift, (l) => l.updateShift)
export const createShift = persisted(shifts.createShift, (l) => l.createShift)
export const removeShift = persisted(shifts.removeShift, (l) => l.removeShift)
export const copyFortnight = persisted(shifts.copyFortnight, (l) => l.copyFortnight)
export const publishFortnight = persisted(shifts.publishFortnight, (l) => l.publishFortnight)

export { getClockEvents, AlreadyClockedInError } from './clockEvents'
export type { ClockLocation, ClockResult } from './clockEvents'
export const clockIn = persisted(clockEvents.clockIn, (l) => l.clockIn)
export const clockOut = persisted(clockEvents.clockOut, (l) => l.clockOut)

export { getCorrections } from './corrections'
export const addCorrection = persisted(corrections.addCorrection, (l) => l.addCorrection)

export { getShiftAttendance, getEffectiveClockEvents, getFortnightHours } from './attendance'
export type { AttendanceSession, EffectiveClockEvent, FortnightHours, VoidedSession } from './attendance'

export { getCorrectionRequests, getClockVoids, getVoidedSessions } from './attendanceFixes'
export const requestVoid = persisted(attendanceFixes.requestVoid, (l) => l.requestVoid)
export const requestEndTime = persisted(attendanceFixes.requestEndTime, (l) => l.requestEndTime)
export const decideCorrectionRequest = persisted(attendanceFixes.decideCorrectionRequest, (l) => l.decideCorrectionRequest)
export const voidClockIn = persisted(attendanceFixes.voidClockIn, (l) => l.voidClockIn)

export { getFlags } from './flags'
export const resolveFlag = persisted(flags.resolveFlag, (l) => l.resolveFlag)

export { getExtensions } from './extensions'
export const requestExtension = persisted(extensions.requestExtension, (l) => l.requestExtension)
export const decideExtension = persisted(extensions.decideExtension, (l) => l.decideExtension)

export { getSwaps } from './swaps'
export const requestSwap = persisted(swaps.requestSwap)
export const decideSwap = persisted(swaps.decideSwap)

export { getPhotos } from './photos'
/** Where to load a photo's image from: a short-lived signed link in the live app. null = no image. */
export async function getPhotoUrl(photo: Photo): Promise<string | null> {
  return MODE === 'live' ? (await import('./live')).photoUrl(photo) : photos.getPhotoUrl(photo)
}
export const uploadPhoto = persisted(photos.uploadPhoto, (l) => l.uploadPhoto)
export const removePhoto = persisted(photos.removePhoto, (l) => l.removePhoto)

export { getShiftRecord, getShiftRecords, getRecordPeople } from './records'
export type { ShiftRecord } from './records'

export { getNotes, getOpenSupplyAlerts, getOpenIssues } from './notes'
export const addNote = persisted(notes.addNote, (l) => l.addNote)
export const markNoteDone = persisted(notes.markNoteDone, (l) => l.markNoteDone)

/**
 * Fetch what other people have changed since (their clock-ins, notes, roster edits). Live mode reads
 * Supabase; demo and trial keep everything on this phone, so there is nothing to fetch (trial mode closes
 * forgotten sessions instead). Never throws: offline, the screen keeps showing the last view.
 */
export async function refreshData(): Promise<void> {
  runDueJobs()
  if (MODE !== 'live') return
  await (await import('./live')).pull().catch(() => {})
}

export { serverNow, setMockNow } from './store'
export { getDataMode, startDataLayer, resetTrialData } from './trial'
export type { DataMode } from './trial'
