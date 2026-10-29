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

/** "Josh Lagos" → "Josh" */
export const firstName = (fullName: string) => fullName.split(' ')[0]

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
