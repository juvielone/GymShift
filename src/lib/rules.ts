// Pure business rules from docs/PRD.md. No data access, no side effects — reusable by the
// mock data layer now and by Supabase functions/RLS helpers later.
// Every threshold comes from SiteSettings; never hardcode 150 m, 3h, 3.5h, etc.
import type { Extension, SiteSettings, Timestamp } from '@/types'

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
 * True when worked time exceeds what has been approved. This only FLAGS for review —
 * worked minutes are never reduced; hours actually worked are paid.
 */
export function isOverWithoutExtension(workedMin: number, extensions: Extension[], settings: SiteSettings): boolean {
  return workedMin > approvedShiftMinutes(extensions, settings)
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
