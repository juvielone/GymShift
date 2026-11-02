// Carly fixes a clock event in place, from the shift sheet or a flag: correct its time, or void a clock-in
// made by mistake (its clock-out goes with it). Both need a reason and append a record (a correction or a
// void, with who and when); the clock event itself never changes.
import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { addCorrection, voidClockIn } from '@/data'
import type { EffectiveClockEvent } from '@/data'
import type { SiteSettings, User } from '@/types'
import { Textarea } from '@/components/ui/textarea'
import { formatClock, formatDateShort, localDay, localTime, zonedTimestamp } from '@/lib/format'
import { cn } from '@/lib/utils'

export type ClockFix = 'correct' | 'void'

interface Props {
  mode: ClockFix
  event: EffectiveClockEvent
  /** Whose event it is, for the quick reasons. */
  name: string
  viewer: User
  settings: SiteSettings
  onDone: () => void
  onCancel: () => void
}

export function ClockFixForm({ mode, event, name, viewer, settings, onDone, onCancel }: Props) {
  const tz = settings.timezone
  const [time, setTime] = useState(localTime(event.effective_time, tz))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const kindLabel = event.kind === 'out' ? 'clock-out' : 'clock-in'
  const quick = mode === 'void' ? ['Tapped by accident', 'Clocked in from home', `Checked with ${name}`] : ['Forgot to clock on time', 'Phone problem', `Checked with ${name}`]
  const unchanged = mode === 'correct' && time === localTime(event.effective_time, tz)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (mode === 'void') await voidClockIn({ clockEventId: event.id, voidedBy: viewer.id, reason })
      else await addCorrection({ clockEventId: event.id, newTime: zonedTimestamp(localDay(event.effective_time, tz), time, tz), reason, correctedBy: viewer.id })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not saved yet. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const chip = (active: boolean) =>
    cn(
      'min-h-12 rounded-xl border px-3 text-[15px] font-medium transition-colors',
      active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background active:bg-muted',
    )

  return (
    <fieldset className="mt-3 space-y-3 pb-1">
      <legend className="text-sm font-medium">
        {mode === 'void'
          ? `Void the ${formatClock(event.effective_time, tz)} clock-in (${formatDateShort(localDay(event.effective_time, tz))})`
          : `Correct the ${kindLabel} time`}
      </legend>
      {mode === 'void' ? (
        <p className="text-[15px] leading-snug text-muted-foreground">
          It stops counting for hours and the export, and so does its clock-out. The record stays, with your reason.
        </p>
      ) : (
        <label className="block">
          <span className="sr-only">New time</span>
          <input
            autoFocus
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-12 w-full rounded-xl border border-border bg-background px-3 text-lg font-semibold"
          />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {quick.map((r) => (
          <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)} className={chip(reason === r)}>
            {r}
          </button>
        ))}
      </div>
      <label htmlFor="clock-fix-reason" className="sr-only">
        Reason
      </label>
      <Textarea id="clock-fix-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (needed)" className="min-h-16 text-base" />
      <p aria-live="polite" className="text-center text-sm text-warn empty:hidden">
        {error}
      </p>
      <button
        type="button"
        disabled={busy || unchanged || !reason.trim()}
        onClick={() => void save()}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground active:bg-brand-press disabled:bg-muted disabled:text-muted-foreground"
      >
        {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
        {mode === 'void' ? 'Void clock-in' : 'Save correction'}
      </button>
      <button type="button" onClick={onCancel} className="h-11 w-full rounded-xl text-base font-medium text-muted-foreground active:bg-muted">
        Cancel
      </button>
    </fieldset>
  )
}
