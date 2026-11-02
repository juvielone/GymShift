// Display formatting for staff-facing screens. Plain, short, site-timezone aware. No data access.
import type { DateString, TimeString, Timestamp } from '@/types'

/** "19:00" → "7:00 pm" */
export function formatTime(time: TimeString): string {
  const [h, m] = time.split(':').map(Number)
  const suffix = h < 12 ? 'am' : 'pm'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** "19:00"–"22:00" → "7:00 – 10:00 pm" (one am/pm when both sides share it). */
export function formatTimeRange(start: TimeString, end: TimeString): string {
  const a = formatTime(start)
  const b = formatTime(end)
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`
}

/** Local "HH:mm" of a timestamp in the site timezone. */
export function localTime(ts: Timestamp, timeZone: string): TimeString {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ts))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('hour')}:${get('minute')}`
}

/** Timestamp → "6:57 pm" in the site timezone. */
export function formatClock(ts: Timestamp, timeZone: string): string {
  return formatTime(localTime(ts, timeZone))
}

const dateFormat = (date: DateString, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', ...options }).format(new Date(`${date}T00:00:00Z`))

/** "2026-10-28" → "Wednesday 28 October" */
export function formatDateLong(date: DateString): string {
  return dateFormat(date, { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')
}

/** "2026-10-31" → "Sat 31 Oct" */
export function formatDateShort(date: DateString): string {
  return dateFormat(date, { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
}

/** 40 → "40 m", 4210 → "4.2 km" */
export function formatDistance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`
}

/** 43 → "43 min", 140 → "2h 20m", 180 → "3h" */
export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min - h * 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** "Josh Lagos" → "Josh". For greeting the person themselves; other people are named with shortName(). */
export const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0]

// Active people's full names, kept current by src/data, so shortName() can tell two Joshes apart.
let teamNames: string[] = []

export function setTeamNames(fullNames: string[]): void {
  teamNames = fullNames
}

const surnameOf = (fullName: string) => fullName.trim().split(/\s+/).slice(1).join(' ')

/**
 * How a person is named on screen: "Josh", or "Josh L." when another active person is also Josh
 * (the whole surname if the initials match too). Exports use full names instead.
 */
export function shortName(fullName: string): string {
  const first = firstName(fullName)
  const surname = surnameOf(fullName)
  const others = teamNames.filter((n) => n.trim() !== fullName.trim() && firstName(n).toLowerCase() === first.toLowerCase())
  if (others.length === 0 || !surname) return first
  const initialTaken = others.some((n) => surnameOf(n)[0]?.toLowerCase() === surname[0].toLowerCase())
  return initialTaken ? `${first} ${surname}` : `${first} ${surname[0].toUpperCase()}.`
}

/** "+61412345678" → "0412 345 678" */
export const formatPhone = (phone: string) => (/^\+614\d{8}$/.test(phone) ? `0${phone.slice(3, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}` : phone)

/** "2026-10-31", "07:00" → "Sat 31 Oct, 7:00 am" */
export const shiftLabel = (date: DateString, start: TimeString) => `${formatDateShort(date)}, ${formatTime(start)}`

/** "World Gym Macquarie Park" → "Macquarie Park": the wordmark in the header already names the brand. */
export const siteShortName = (siteName: string) => siteName.replace(/^World Gym\s+/i, '')

/**
 * Site-local date + time → timestamp with the site's UTC offset, e.g. ("2026-10-28", "07:05") →
 * "2026-10-28T07:05:00+11:00". Used for attendance corrections Carly types in local time.
 */
export function zonedTimestamp(date: DateString, time: TimeString, timeZone: string): Timestamp {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const offsetMin = (at: number) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(at))
    const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(parts.find((p) => p.type === 'timeZoneName')?.value ?? '')
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0
  }
  const offset = offsetMin(guess - offsetMin(guess) * 60_000)
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date}T${time}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** Site-local calendar date of a timestamp, "YYYY-MM-DD". */
export const localDay = (ts: Timestamp, timeZone: string): DateString => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(ts))

/** "-33.7769, 151.1203" as copied from Google Maps → coordinates, or null if it isn't a valid pair. */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const m = /^\s*\(?\s*(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?\s*$/.exec(text)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null
}

/** Coordinates to 5 decimals (about 1 m), the precision that matters for the geofence. */
export const formatLatLng = (lat: number, lng: number): string => `${lat.toFixed(5)}, ${lng.toFixed(5)}`
