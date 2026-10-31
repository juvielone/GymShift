// Today's shifts on a black pass: who is on, done, not started, or not in yet.
import { Check, ChevronRight } from 'lucide-react'
import type { AttendanceSession } from '@/data'
import type { Shift, SiteSettings, Timestamp, User } from '@/types'
import { firstName, formatClock, formatDuration, formatTime, formatTimeRange, zonedTimestamp } from '@/lib/format'
import { compareTs, minutesBetween, noShowDueAt } from '@/lib/rules'
import { cn } from '@/lib/utils'

export interface TodayRow {
  shift: Shift
  user: User
  session: AttendanceSession | null
  /** From a "running late" note: when they said they'd arrive. */
  arriveBy: Timestamp | null
}

/** Each row opens that shift's record (times, photos, notes) when onOpen is given. */
export function TodayPanel({ rows, settings, now, onOpen }: { rows: TodayRow[]; settings: SiteSettings; now: Timestamp; onOpen?: (shiftId: string) => void }) {
  const tz = settings.timezone
  return (
    <section aria-labelledby="today-title" className="rounded-[18px] bg-pass p-[18px] text-pass-foreground shadow-[0_8px_24px_-12px_rgb(0_0_0/0.45)]">
      <h2 id="today-title" className="text-[15px] font-medium text-pass-muted">
        Today{rows.length > 0 && ` · ${rows.length} ${rows.length === 1 ? 'shift' : 'shifts'}`}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-base">No shifts today.</p>
      ) : (
        <ul className="mt-1 divide-y divide-pass-line">
          {rows.map(({ shift, user, session, arriveBy }) => {
            const inAt = session?.clock_in?.effective_time
            const outAt = session?.clock_out?.effective_time
            const startTs = zonedTimestamp(shift.date, shift.start_time, tz)
            const started = compareTs(now, startTs) >= 0
            // A late note keeps the row calm until its time plus the no-show window has passed.
            const lateCalm = arriveBy !== null && compareTs(now, noShowDueAt(startTs, arriveBy, settings)) < 0
            let chip: { label: string; tone: 'live' | 'done' | 'quiet' | 'warn' }
            let line: string
            if (inAt && outAt) {
              chip = { label: 'Done', tone: 'done' }
              line = `In ${formatClock(inAt, tz)} · Out ${formatClock(outAt, tz)}`
            } else if (inAt) {
              chip = { label: 'On shift', tone: 'live' }
              line = `In ${formatClock(inAt, tz)} · ${formatDuration(minutesBetween(inAt, now))}`
            } else if (started && lateCalm) {
              chip = { label: 'Running late', tone: 'quiet' }
              line = `Said about ${formatClock(arriveBy, tz)}`
            } else if (started) {
              chip = { label: 'Not in yet', tone: 'warn' }
              line = arriveBy ? `Was due ${formatTime(shift.start_time)} · said about ${formatClock(arriveBy, tz)}` : `Was due ${formatTime(shift.start_time)}`
            } else {
              chip = { label: `Starts ${formatTime(shift.start_time)}`, tone: 'quiet' }
              line = arriveBy ? `Running late · about ${formatClock(arriveBy, tz)}` : formatTimeRange(shift.start_time, shift.end_time)
            }
            return (
              <li key={shift.id}>
                <button
                  type="button"
                  disabled={!onOpen}
                  onClick={() => onOpen?.(shift.id)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-[12px] px-2 py-3 text-left transition-colors enabled:hover:bg-white/[0.06] enabled:active:bg-white/10"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium">
                      {firstName(user.full_name)} <span className="font-normal text-pass-muted">· {shift.type === 'morning' ? 'Morning' : 'Night'}</span>
                    </span>
                    <span className="block text-sm text-pass-muted">{line}</span>
                  </span>
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
                  {onOpen && <ChevronRight aria-hidden className="-mr-1 size-5 shrink-0 text-pass-muted" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
