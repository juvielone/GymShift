// Today's shifts on a black pass: who is on, done, not started, or not in yet.
import { Check } from 'lucide-react'
import type { AttendanceSession } from '@/data'
import type { Shift, SiteSettings, Timestamp, User } from '@/types'
import { firstName, formatClock, formatDuration, formatTime, formatTimeRange, zonedTimestamp } from '@/lib/format'
import { compareTs, minutesBetween } from '@/lib/rules'
import { cn } from '@/lib/utils'

export interface TodayRow {
  shift: Shift
  user: User
  session: AttendanceSession | null
}

export function TodayPanel({ rows, settings, now }: { rows: TodayRow[]; settings: SiteSettings; now: Timestamp }) {
  const tz = settings.timezone
  return (
    <section aria-labelledby="today-title" className="rounded-[18px] bg-pass p-[18px] text-pass-foreground shadow-[0_8px_24px_-12px_rgb(0_0_0/0.45)]">
      <h2 id="today-title" className="text-[15px] font-medium text-pass-muted">
        Today
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-base">No shifts today.</p>
      ) : (
        <ul className="mt-1 divide-y divide-pass-line">
          {rows.map(({ shift, user, session }) => {
            const inAt = session?.clock_in?.effective_time
            const outAt = session?.clock_out?.effective_time
            const started = compareTs(now, zonedTimestamp(shift.date, shift.start_time, tz)) >= 0
            let chip: { label: string; tone: 'live' | 'done' | 'quiet' | 'warn' }
            let line: string
            if (inAt && outAt) {
              chip = { label: 'Done', tone: 'done' }
              line = `In ${formatClock(inAt, tz)} · Out ${formatClock(outAt, tz)}`
            } else if (inAt) {
              chip = { label: 'On shift', tone: 'live' }
              line = `In ${formatClock(inAt, tz)} · ${formatDuration(minutesBetween(inAt, now))}`
            } else if (started) {
              chip = { label: 'Not in yet', tone: 'warn' }
              line = `Was due ${formatTime(shift.start_time)}`
            } else {
              chip = { label: `Starts ${formatTime(shift.start_time)}`, tone: 'quiet' }
              line = formatTimeRange(shift.start_time, shift.end_time)
            }
            return (
              <li key={shift.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-base font-medium">
                    {firstName(user.full_name)} <span className="font-normal text-pass-muted">· {shift.type === 'morning' ? 'Morning' : 'Night'}</span>
                  </p>
                  <p className="text-sm text-pass-muted">{line}</p>
                </div>
                <span
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] leading-none font-semibold',
                    chip.tone === 'live' && 'bg-pass-foreground text-pass',
                    chip.tone === 'done' && 'bg-pass-line text-pass-foreground',
                    chip.tone === 'quiet' && 'bg-pass-line text-pass-foreground',
                    chip.tone === 'warn' && 'bg-warn-soft text-warn',
                  )}
                >
                  {chip.tone === 'live' && <span aria-hidden className="size-[7px] rounded-full bg-brand" />}
                  {chip.tone === 'done' && <Check aria-hidden className="size-3.5" strokeWidth={3} />}
                  {chip.label}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
