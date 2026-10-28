// Today's shift as a pass: what it is, where it's up to, and the progress line.
// The line never cuts time: past the approved length it keeps filling, and the mark stays put.
import { Check, Clock, Moon, Sunrise } from 'lucide-react'
import type { SiteSettings, Timestamp } from '@/types'
import type { HomePhase, Session } from '@/hooks/useCleanerHome'
import { formatClock, formatDuration, formatTime, formatTimeRange, localTime } from '@/lib/format'
import { minutesBetween } from '@/lib/rules'
import { cn } from '@/lib/utils'

const addMinutes = (ts: Timestamp, min: number) => new Date(Date.parse(ts) + min * 60_000).toISOString()

/** State changes on the pass fade in rather than snap. */
const enter = 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500'

interface Props {
  phase: HomePhase
  settings: SiteSettings
  now: Timestamp
  nextShiftLabel: string | null
}

export function ShiftPass({ phase, settings, now, nextShiftLabel }: Props) {
  if (phase.kind === 'no_shift') {
    return (
      <section aria-labelledby="pass-title" className={cn('rounded-[18px] border border-border bg-background p-[18px]', enter)}>
        <h2 id="pass-title" className="text-2xl font-semibold tracking-tight">
          No shift today
        </h2>
        <p className="mt-1 text-[15px] text-muted-foreground">{nextShiftLabel ? `Your next shift: ${nextShiftLabel}.` : 'No more shifts this fortnight.'}</p>
      </section>
    )
  }

  const tz = settings.timezone
  const shift = phase.kind === 'before' ? phase.shift : phase.session.shift
  const session = phase.kind === 'before' ? null : phase.session
  const TypeIcon = !shift ? Clock : shift.type === 'morning' ? Sunrise : Moon
  const pastMark = phase.kind === 'on' && shift !== null && phase.session.workedMin > phase.session.approvedMin
  const title = shift ? `${shift.type === 'morning' ? 'Morning' : 'Night'} shift` : 'Not on the roster'

  return (
    <section aria-labelledby="pass-title" className="rounded-[18px] bg-pass p-[18px] text-pass-foreground shadow-[0_8px_24px_-12px_rgb(0_0_0/0.45)]">
      <div className="flex items-center justify-between gap-3">
        <h2 id="pass-title" className="flex items-center gap-2 text-[15px] font-medium text-pass-muted">
          <TypeIcon aria-hidden className="size-4 shrink-0" />
          {title}
        </h2>
        <StatusChip key={phase.kind} phase={phase} now={now} tz={tz} />
      </div>

      <p className="mt-3 text-[34px] leading-[1.1] font-semibold tracking-[-0.02em]">
        {shift ? formatTimeRange(shift.start_time, shift.end_time) : `Since ${formatClock(session!.clockIn.effective_time, tz)}`}
      </p>

      <ProgressLine session={session} settings={settings} />
      <Legend phase={phase} settings={settings} tz={tz} />

      <div key={phase.kind} className={enter}>
        {session ? (
          <>
            {/* Unscheduled time has no approved length, so there's nothing "left" to count down. */}
            <SessionStats session={session} done={phase.kind === 'done' || !shift} />
            {pastMark && (
              <p className="mt-2.5 text-[15px] leading-snug text-pass-muted">
                You're past your approved time, so Carly will check it. Clock out when you're done. All your time is saved.
              </p>
            )}
          </>
        ) : (
          <p className="mt-3.5 border-t border-pass-line pt-3 text-[15px] text-pass-muted">Tap Clock in when you arrive.</p>
        )}
      </div>
    </section>
  )
}

function StatusChip({ phase, now, tz }: { phase: HomePhase; now: Timestamp; tz: string }) {
  const base = cn(
    'flex shrink-0 items-center gap-1.5 rounded-full bg-pass-foreground px-2.5 py-1.5 text-[13px] leading-none font-semibold text-pass',
    enter,
  )
  if (phase.kind === 'on')
    return (
      <span className={base}>
        <span aria-hidden className="size-[7px] rounded-full bg-brand" />
        On shift
      </span>
    )
  if (phase.kind === 'done')
    return (
      <span className={base}>
        <Check aria-hidden className="size-3.5" strokeWidth={3} />
        Done
      </span>
    )
  if (phase.kind !== 'before') return null
  const nowLocal = localTime(now, tz)
  const untilMin = minutesBetween(`2000-01-01T${nowLocal}:00Z`, `2000-01-01T${phase.shift.start_time}:00Z`)
  const label = untilMin > 0 ? `Starts in ${formatDuration(untilMin)}` : `Started ${formatTime(phase.shift.start_time)}`
  return <span className={cn(base, 'bg-pass-line text-pass-foreground')}>{label}</span>
}

function ProgressLine({ session, settings }: { session: Session | null; settings: SiteSettings }) {
  const worked = session?.workedMin ?? 0
  // Unscheduled time has no approved length and can't be extended: show the fill only.
  const rostered = session === null || session.shift !== null
  const approved = session?.approvedMin ?? settings.standard_shift_min
  const scale = Math.max(settings.max_shift_min, worked)
  const pct = (min: number) => `${Math.min(100, (min / scale) * 100)}%`

  return (
    <div
      role="progressbar"
      aria-label="Shift progress"
      aria-valuemin={0}
      aria-valuemax={rostered ? approved : scale}
      aria-valuenow={rostered ? Math.min(worked, approved) : worked}
      aria-valuetext={rostered ? `${formatDuration(worked)} worked of ${formatDuration(approved)}` : `${formatDuration(worked)} worked`}
      className="relative mt-4 h-1.5 rounded-full bg-pass-line"
    >
      {/* Extra time that could still be approved, up to the maximum shift length. */}
      {rostered && approved < settings.max_shift_min && (
        <div
          aria-hidden
          className="absolute inset-y-0 rounded-r-full bg-[repeating-linear-gradient(90deg,var(--pass-zone)_0_3px,transparent_3px_6px)]"
          style={{ left: pct(approved), right: `${100 - (settings.max_shift_min / scale) * 100}%` }}
        />
      )}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full bg-pass-foreground transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{ width: pct(worked) }}
      />
      {rostered && (
        <div
          aria-hidden
          className="absolute -top-[5px] h-4 w-0.5 -translate-x-1/2 rounded-full bg-pass-foreground transition-[left] duration-700 ease-out motion-reduce:transition-none"
          style={{ left: pct(approved) }}
        />
      )}
    </div>
  )
}

function Legend({ phase, settings, tz }: { phase: HomePhase; settings: SiteSettings; tz: string }) {
  let left: string
  let right: string
  if (phase.kind === 'before') {
    left = `${formatDuration(settings.standard_shift_min)} shift`
    right = `Finish ${formatTime(phase.shift.end_time)}`
  } else if (phase.kind === 'on' || phase.kind === 'done') {
    const s = phase.session
    left = `In ${formatClock(s.clockIn.effective_time, tz)}`
    right = s.clockOut
      ? `Out ${formatClock(s.clockOut.effective_time, tz)}`
      : s.shift
        ? `Finish ${formatClock(addMinutes(s.clockIn.effective_time, s.approvedMin), tz)}`
        : 'Not rostered'
  } else return null
  return (
    <div className="mt-2 flex justify-between text-[13px] font-medium text-pass-muted">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  )
}

function SessionStats({ session, done }: { session: Session; done: boolean }) {
  const over = session.workedMin - session.approvedMin
  return (
    <dl className="mt-3.5 flex gap-8 border-t border-pass-line pt-3">
      <div>
        <dt className="text-[13px] text-pass-muted">Worked</dt>
        <dd className="text-xl font-semibold">{formatDuration(session.workedMin)}</dd>
      </div>
      {!done && (
        <div>
          <dt className="text-[13px] text-pass-muted">{over > 0 ? 'Over' : 'Left'}</dt>
          <dd className="text-xl font-semibold">{formatDuration(Math.abs(over))}</dd>
        </div>
      )}
    </dl>
  )
}
