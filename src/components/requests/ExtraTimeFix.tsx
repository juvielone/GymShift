// "Correct time" on an extra-time card: Carly sets the finish she thinks is fair, with a reason, and the
// extra time up to it is approved in the same step. The correction is a new row (who, when, old, new, reason);
// the clock-out itself never changes, and the recorded time stays on the record.
import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { decideExtraTime } from '@/data'
import type { EffectiveClockEvent } from '@/data'
import type { SiteSettings, User } from '@/types'
import { Textarea } from '@/components/ui/textarea'
import { formatClock, formatDuration, localDay, localTime, zonedTimestamp } from '@/lib/format'
import { addDays, compareTs, extraToApprove, minutesBetween } from '@/lib/rules'
import { cn } from '@/lib/utils'

interface Props {
  shiftId: string
  clockIn: EffectiveClockEvent
  clockOut: EffectiveClockEvent
  /** Already approved before this decision (standard plus earlier approvals). */
  approvedMin: number
  settings: SiteSettings
  /** Short name of the person, for the quick reasons. */
  name: string
  viewer: User
  tz: string
  onDone: () => void
  onCancel: () => void
}

export function ExtraTimeFix({ shiftId, clockIn, clockOut, approvedMin, settings, name, viewer, tz, onDone, onCancel }: Props) {
  const [time, setTime] = useState(localTime(clockOut.effective_time, tz))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The picked time on the clock-out's day or the day before (a night shift past midnight), after the clock-in
  // and nearest the recorded clock-out.
  const day = localDay(clockOut.effective_time, tz)
  const picked = time
    ? [addDays(day, -1), day]
        .map((d) => zonedTimestamp(d, time, tz))
        .filter((t) => compareTs(t, clockIn.effective_time) > 0)
        .sort((a, b) => Math.abs(Date.parse(a) - Date.parse(clockOut.effective_time)) - Math.abs(Date.parse(b) - Date.parse(clockOut.effective_time)))[0]
    : undefined
  const worked = picked ? minutesBetween(clockIn.effective_time, picked) : null
  const unchanged = time === localTime(clockOut.effective_time, tz)
  const quick = [`Agreed with ${name}`, 'Stayed longer than needed', 'Left before clocking out']

  async function save() {
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      await decideExtraTime({ shiftId, decidedBy: viewer.id, approve: true, finishAt: picked, reason })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not saved yet. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const chip = (active: boolean) =>
    cn(
      'min-h-11 rounded-xl border px-3 text-[15px] font-medium transition-colors',
      active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background active:bg-muted',
    )

  return (
    <fieldset className="mt-3 space-y-3">
      <legend className="text-sm font-medium">What finish time is fair?</legend>
      <label className="block">
        <span className="sr-only">Finish time</span>
        <input
          autoFocus
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="h-12 w-full rounded-xl border border-border bg-background px-3 text-lg font-semibold"
        />
      </label>
      <p className="text-sm leading-snug text-muted-foreground">
        Clocked in {formatClock(clockIn.effective_time, tz)}, out {formatClock(clockOut.effective_time, tz)}.
        {worked !== null && !unchanged && (
          <>
            {' '}
            Counts as <span className="font-semibold text-foreground">{formatDuration(worked)}</span>
            {extraToApprove(worked, approvedMin, settings) > 0 ? `, with ${formatDuration(extraToApprove(worked, approvedMin, settings))} extra approved.` : '.'}
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {quick.map((r) => (
          <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)} className={chip(reason === r)}>
            {r}
          </button>
        ))}
      </div>
      <label htmlFor={`extra-fix-${shiftId}`} className="sr-only">
        Reason
      </label>
      <Textarea id={`extra-fix-${shiftId}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (needed)" className="min-h-16 text-base" />
      <p aria-live="polite" className="text-sm text-warn empty:hidden">
        {error}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-border px-4 text-[15px] font-semibold active:bg-muted">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || unchanged || !picked || !reason.trim()}
          onClick={() => void save()}
          className="inline-flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-[15px] font-semibold text-background disabled:bg-muted disabled:text-muted-foreground"
        >
          {busy && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
          {picked && !unchanged ? `Save ${formatClock(picked, tz)} and approve` : 'Save and approve'}
        </button>
      </div>
    </fieldset>
  )
}
