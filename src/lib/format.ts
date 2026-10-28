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

/** 43 → "43 min", 140 → "2h 20m", 180 → "3h" */
export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min - h * 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** "Maria Santos" → "Maria" */
export const firstName = (fullName: string) => fullName.split(' ')[0]

/** "2026-10-31", "07:00" → "Sat 31 Oct, 7:00 am" */
export const shiftLabel = (date: DateString, start: TimeString) => `${formatDateShort(date)}, ${formatTime(start)}`

/** "World Gym Macquarie Park" → "Macquarie Park": the wordmark in the header already names the brand. */
export const siteShortName = (siteName: string) => siteName.replace(/^World Gym\s+/i, '')
