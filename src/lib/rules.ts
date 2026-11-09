// Pure business rules from docs/PRD.md. No data access, no side effects — reusable by the
// mock data layer now and by Supabase functions/RLS helpers later.
// Every threshold comes from SiteSettings; never hardcode 150 m, 3h, 3.5h, etc.
import type { Extension, Shift, SiteSettings, Timestamp } from '@/types'
import { zonedTimestamp } from './format'

/** Whole minutes between two timestamps. Never clamps or rounds down to the rostered length. */
export function minutesBetween(start: Timestamp, end: Timestamp): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 60_000)
}

/** 200 → "3h 20m" */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  return `${h}h ${min - h * 60}m`
}

/** Great-circle distance in metres (haversine). */
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Off-site rule: flagged when distance minus GPS accuracy exceeds the radius.
 * Poor accuracy alone never flags. A missing location is a separate 'no_location' flag, not off-site.
 */
export function isOffSite(distanceM: number | null, accuracyM: number | null, settings: SiteSettings): boolean {
  if (distanceM === null) return false
  return distanceM - (accuracyM ?? 0) > settings.radius_m
}

/** Sum of approved extension minutes for one shift. */
export function approvedExtensionMinutes(extensions: Extension[]): number {
  return extensions.filter((e) => e.status === 'approved').reduce((sum, e) => sum + e.minutes, 0)
}

/** Longest shift that is covered by approvals: standard + approved extensions, capped at the maximum. */
export function approvedShiftMinutes(extensions: Extension[], settings: SiteSettings): number {
  return Math.min(settings.standard_shift_min + approvedExtensionMinutes(extensions), settings.max_shift_min)
}

/**
 * True when worked time exceeds what has been approved by more than the leeway (over_length_grace_min).
 * This only FLAGS for review: worked minutes are never reduced, and the leeway minutes are paid like any other.
 * Mirrors private.is_over_length().
 */
export function isOverWithoutExtension(workedMin: number, extensions: Extension[], settings: SiteSettings): boolean {
  return isOverApproved(workedMin, approvedShiftMinutes(extensions, settings), settings)
}

/** Worked time beyond the approved length plus the leeway. */
export function isOverApproved(workedMin: number, approvedMin: number, settings: SiteSettings): boolean {
  return workedMin > approvedMin + settings.over_length_grace_min
}

/** Whether approving `requestMin` more minutes keeps the shift within the maximum (3.5h). */
export function canApproveExtension(requestMin: number, extensions: Extension[], settings: SiteSettings): boolean {
  if (requestMin < 1 || requestMin > settings.max_extension_request_min) return false
  return settings.standard_shift_min + approvedExtensionMinutes(extensions) + requestMin <= settings.max_shift_min
}

const plusMinutes = (ts: Timestamp, min: number): Timestamp => new Date(Date.parse(ts) + min * 60_000).toISOString()

/** Photos can be added from clock-in until this long after clock-out. null = still on shift, so still open. */
export function photoWindowClosesAt(clockOut: Timestamp | null, settings: SiteSettings): Timestamp | null {
  return clockOut === null ? null : plusMinutes(clockOut, settings.photo_upload_window_min)
}

/**
 * Where the photo window counts from: the latest of the clock-out's effective time, when it was really made,
 * and when it was answered. After an automatic close at the rostered end, the window opens when the cleaner hears
 * about it, not hours earlier. Mirrors private.photo_window_from().
 */
export function photoWindowStart(clockOut: { server_time: Timestamp; effective_time: Timestamp }, answeredAt: Timestamp | null): Timestamp {
  return [clockOut.server_time, clockOut.effective_time, ...(answeredAt ? [answeredAt] : [])].reduce((a, b) => (compareTs(a, b) >= 0 ? a : b))
}

/** The cleaner can remove their own photo for a short time after adding it (a mistake, not a review). */
export function canRemoveOwnPhoto(uploadedAt: Timestamp, now: Timestamp, settings: SiteSettings): boolean {
  return compareTs(now, plusMinutes(uploadedAt, settings.photo_remove_window_min)) < 0
}

/**
 * When a missing clock-in becomes a possible no-show: the no-show window after the shift starts, or
 * after the time a "running late" note said they'd arrive, whichever is later. Lateness itself is never
 * flagged; paid time starts at clock-in, so nothing needs cutting.
 */
export function noShowDueAt(shiftStart: Timestamp, arriveBy: Timestamp | null, settings: SiteSettings): Timestamp {
  const from = arriveBy !== null && compareTs(arriveBy, shiftStart) > 0 ? arriveBy : shiftStart
  return plusMinutes(from, settings.no_show_after_min)
}

/** When a shift starts, as a timestamp in the site timezone. */
export function shiftStartAt(shift: Pick<Shift, 'date' | 'start_time'>, settings: SiteSettings): Timestamp {
  return zonedTimestamp(shift.date, shift.start_time, settings.timezone)
}

/** When a shift ends. One ending at or before its start ends the next day (private.shift_end_at()). */
export function shiftEndAt(shift: Pick<Shift, 'date' | 'start_time' | 'end_time'>, settings: SiteSettings): Timestamp {
  const nextDay = shift.end_time <= shift.start_time
  return zonedTimestamp(nextDay ? addDays(shift.date, 1) : shift.date, shift.end_time, settings.timezone)
}

/** Minutes from the rostered start to a clock-in: negative = early. */
export function minutesFromStart(clockIn: Timestamp, shiftStart: Timestamp): number {
  return minutesBetween(shiftStart, clockIn)
}

/**
 * A clock-in this far from the rostered start, early or late, is flagged (and the phone asks first).
 * Flag only: it always saves. Mirrors clock_in() in 12_attendance_fixes.sql.
 */
export function isOffStart(clockIn: Timestamp, shiftStart: Timestamp, settings: SiteSettings): boolean {
  return Math.abs(minutesFromStart(clockIn, shiftStart)) > settings.start_mismatch_min
}

/** Before clocking in, ask once: no rostered shift to link to today, or far from its start. An on-time clock-in is one tap. */
export function needsClockInConfirm(shiftStart: Timestamp | null, now: Timestamp, settings: SiteSettings): boolean {
  return shiftStart === null || isOffStart(now, shiftStart, settings)
}

/** A clock-out within a minute or two of clocking in is flagged (a tap straight after the other). Flag only. */
export function isShortSession(workedMin: number, settings: SiteSettings): boolean {
  return workedMin < settings.short_session_flag_min
}

/**
 * When a session is expected to finish: clock-in plus its approved length (the standard 3h plus approved extra
 * time; the standard length when unscheduled). The rostered times are a guide: a cleaner who starts late or early
 * works their full shift from when they clock in. A forgotten session is closed here, and the missing clock-out
 * flag counts from here. Nothing measured is cut: no end was measured.
 * Mirrors private.expected_end(); keep them in step.
 */
export function assumedEnd(clockIn: Timestamp, approvedMin: number): Timestamp {
  return plusMinutes(clockIn, approvedMin)
}

/** When a session still open raises the missing clock-out flag: missing_out_after_min after its expected end. */
export function missingOutDueAt(end: Timestamp, settings: SiteSettings): Timestamp {
  return plusMinutes(end, settings.missing_out_after_min)
}

/** When a session still open is closed automatically: auto_close_after_min after its assumed end. */
export function autoCloseDueAt(end: Timestamp, settings: SiteSettings): Timestamp {
  return plusMinutes(end, settings.auto_close_after_min)
}

/** Oldest day still kept in the records: photos and reports are deleted after the retention period. */
export function recordsOldestDate(today: string, settings: SiteSettings): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - settings.photo_retention_months)
  return d.toISOString().slice(0, 10)
}

/** Add days to a "YYYY-MM-DD" date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Monday that starts the fortnight containing `date`, counted in 14-day steps from the roster anchor. */
export function fortnightStartOf(date: string, settings: SiteSettings): string {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${settings.roster_anchor_date}T00:00:00Z`)) / 86_400_000)
  return addDays(settings.roster_anchor_date, Math.floor(days / 14) * 14)
}

/**
 * The last moment late photos can be added: the end of the fortnight the shift's day belongs to (midnight
 * starting the next one, local time). Mirrors private.photo_late_until().
 */
export function photoLateUntil(date: string, settings: SiteSettings): Timestamp {
  return zonedTimestamp(addDays(fortnightStartOf(date, settings), 14), '00:00', settings.timezone)
}

/** Default shift end: start + the standard shift length, e.g. "19:00" → "22:00". */
export function defaultEndTime(start: string, settings: SiteSettings): string {
  const [h, m] = start.split(':').map(Number)
  const total = (h * 60 + m + settings.standard_shift_min) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Local calendar date ("YYYY-MM-DD") of a timestamp in the site's timezone. */
export function localDate(ts: Timestamp, settings: SiteSettings): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone }).format(new Date(ts))
}

/**
 * Order two timestamps by instant, not by text. Seeded rows carry "+11:00" offsets while the
 * server clock writes UTC ("…Z"), so string comparison would put a new event before an older one.
 */
export function compareTs(a: Timestamp, b: Timestamp): number {
  return Date.parse(a) - Date.parse(b)
}
