// The ONLY entry point for data in the app. UI code imports from '@/data', never from '@/mocks'
// or a Supabase client. Internal helpers (store, raiseFlag, photoFiles) are deliberately not re-exported.
import * as users from './users'
import * as settings from './settings'
import * as availability from './availability'
import * as shifts from './shifts'
import * as clockEvents from './clockEvents'
import * as corrections from './corrections'
import * as flags from './flags'
import * as extensions from './extensions'
import * as swaps from './swaps'
import * as photos from './photos'
import * as notes from './notes'
import { persist } from './store'

/** Every write saves the store to the phone in trial mode (a no-op in demo mode). Reads are left as they are. */
function persisted<A extends unknown[], R>(write: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args) => {
    try {
      return await write(...args)
    } finally {
      persist()
    }
  }
}

export { getCurrentUser, isSignedIn, getDemoAccounts, getUsers, getUser, getRoles, getPermissions, getStaffImpact, ASSIGNABLE_ROLES } from './users'
export type { StaffImpact } from './users'
export const setMockCurrentUser = persisted(users.setMockCurrentUser)
export const signOut = persisted(users.signOut)
export const createUser = persisted(users.createUser)
export const updateUser = persisted(users.updateUser)
export const setUserActive = persisted(users.setUserActive)

export { getSettings, RADIUS_MIN_M, RADIUS_MAX_M } from './settings'
export const updateSiteLocation = persisted(settings.updateSiteLocation)

export { getAvailability } from './availability'
export const markUnavailable = persisted(availability.markUnavailable)

export { getShifts, getShift, getUpcomingShifts, getShiftChanges, getShiftChangesForFortnight, getRosterWarnings } from './shifts'
export type { RosterWarning, RosterWarningKind } from './shifts'
export const updateShift = persisted(shifts.updateShift)
export const createShift = persisted(shifts.createShift)
export const removeShift = persisted(shifts.removeShift)
export const copyFortnight = persisted(shifts.copyFortnight)
export const publishFortnight = persisted(shifts.publishFortnight)

export { getClockEvents } from './clockEvents'
export type { ClockLocation, ClockResult } from './clockEvents'
export const clockIn = persisted(clockEvents.clockIn)
export const clockOut = persisted(clockEvents.clockOut)

export { getCorrections } from './corrections'
export const addCorrection = persisted(corrections.addCorrection)

export { getShiftAttendance, getEffectiveClockEvents, getFortnightHours } from './attendance'
export type { AttendanceSession, EffectiveClockEvent, FortnightHours } from './attendance'

export { getFlags } from './flags'
export const resolveFlag = persisted(flags.resolveFlag)

export { getExtensions } from './extensions'
export const requestExtension = persisted(extensions.requestExtension)
export const decideExtension = persisted(extensions.decideExtension)

export { getSwaps } from './swaps'
export const requestSwap = persisted(swaps.requestSwap)
export const decideSwap = persisted(swaps.decideSwap)

export { getPhotos, getPhotoUrl } from './photos'
export const uploadPhoto = persisted(photos.uploadPhoto)
export const removePhoto = persisted(photos.removePhoto)

export { getShiftRecord, getShiftRecords, getRecordPeople } from './records'
export type { ShiftRecord } from './records'

export { getNotes, getOpenSupplyAlerts, getOpenIssues } from './notes'
export const addNote = persisted(notes.addNote)
export const markNoteDone = persisted(notes.markNoteDone)

export { serverNow, setMockNow } from './store'
export { getDataMode, startDataLayer, resetTrialData } from './trial'
export type { DataMode } from './trial'
