// The ONLY entry point for data in the app. UI code imports from '@/data', never from '@/mocks'
// or a Supabase client. Internal helpers (store, raiseFlag) are deliberately not re-exported.
export { getCurrentUser, getDemoAccounts, setMockCurrentUser, getUsers, getUser, getRoles, getPermissions } from './users'
export { getSettings, updateSiteLocation, RADIUS_MIN_M, RADIUS_MAX_M } from './settings'
export { getAvailability, markUnavailable } from './availability'
export {
  getShifts,
  getShift,
  getUpcomingShifts,
  getShiftChanges,
  getShiftChangesForFortnight,
  updateShift,
  createShift,
  removeShift,
  copyFortnight,
  getRosterWarnings,
  publishFortnight,
} from './shifts'
export type { RosterWarning, RosterWarningKind } from './shifts'
export { getClockEvents, clockIn, clockOut } from './clockEvents'
export type { ClockLocation, ClockResult } from './clockEvents'
export { getCorrections, addCorrection } from './corrections'
export { getShiftAttendance, getEffectiveClockEvents, getFortnightHours } from './attendance'
export type { AttendanceSession, EffectiveClockEvent, FortnightHours } from './attendance'
export { getFlags, resolveFlag } from './flags'
export { getExtensions, requestExtension, decideExtension } from './extensions'
export { getSwaps, requestSwap, decideSwap } from './swaps'
export { getPhotos, addPhoto } from './photos'
export { getNotes, getOpenSupplyAlerts, addNote, markNoteDone } from './notes'
export { serverNow, setMockNow } from './store'
