// One flag, with the facts Carly needs: the clock event, its location, past corrections.
// Correcting appends a correction row (who, when, old, new, reason); the clock event is never edited.
// Voiding a clock-in made by mistake appends a void (its clock-out goes with it) and resolves its flags.
import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { addCorrection, getCorrections, getEffectiveClockEvents, resolveFlag } from '@/data'
import type { EffectiveClockEvent } from '@/data'
import type { Correction, Flag, Shift, SiteSettings, User } from '@/types'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Textarea } from '@/components/ui/textarea'
import { FLAG_LABEL } from '@/components/manager/flagText'
import { ClockFixForm } from '@/components/manager/ClockFixForm'
import { shortName, formatClock, formatDateShort, formatTimeRange, localDay, localTime, zonedTimestamp } from '@/lib/format'
import { compareTs, isOffSite } from '@/lib/rules'
import { cn } from '@/lib/utils'

export interface FlagView {
  flag: Flag
  user: User
  shift: Shift | null
}

interface Props {
  view: FlagView | null
  viewer: User
  settings: SiteSettings
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}

export function FlagSheet({ view, viewer, settings, onOpenChange, onChanged }: Props) {
  const tz = settings.timezone
  const [event, setEvent] = useState<EffectiveClockEvent | null>(null)
  const [history, setHistory] = useState<Correction[]>([])
  const [correcting, setCorrecting] = useState(false)
  // The clock-in a void would remove: the flagged one, or the one a flagged clock-out closed.
  const [voidTarget, setVoidTarget] = useState<EffectiveClockEvent | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [time, setTime] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eventId = view?.flag.clock_event_id ?? null
  const userId = view?.user.id

  useEffect(() => {
    // Keyed by flag in the parent, so state starts fresh for each flag.
    if (!eventId || !userId) return
    let live = true
    void (async () => {
      const [events, corrections] = await Promise.all([getEffectiveClockEvents({ userId, includeVoided: true }), getCorrections({ clockEventId: eventId })])
      if (!live) return
      const e = events.find((x) => x.id === eventId) ?? null
      setEvent(e)
      setHistory(corrections)
      if (e) setTime(localTime(e.effective_time, tz))
      if (e && !e.voided) {
        const before = events.filter((x) => !x.voided && compareTs(x.server_time, e.server_time) < 0).sort((a, b) => compareTs(a.server_time, b.server_time)).at(-1)
        setVoidTarget(e.kind === 'in' ? e : before?.kind === 'in' ? before : null)
      }
    })()
    return () => {
      live = false
    }
  }, [eventId, userId, tz])

  if (!view) return null
  const { flag, user, shift } = view
  const name = shortName(user.full_name)
  const quickReasons = ['Forgot to clock on time', 'Phone problem', `Checked with ${name}`]

  async function run(action: () => Promise<unknown>, close: boolean) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
      if (close) onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not saved yet. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const saveCorrection = () =>
    run(async () => {
      if (!event) return
      const c = await addCorrection({ clockEventId: event.id, newTime: zonedTimestamp(localDay(event.effective_time, tz), time, tz), reason, correctedBy: viewer.id })
      setHistory((h) => [...h, c])
      setEvent({ ...event, effective_time: c.new_time, corrected: true })
      setCorrecting(false)
      setReason('')
    }, false)

  const unchanged = event ? time === localTime(event.effective_time, tz) : true
  const kindLabel = event?.kind === 'out' ? 'Clock-out' : 'Clock-in'

  let location = 'Not recorded'
  if (event?.location_status === 'ok' && event.distance_m !== null) {
    location = isOffSite(event.distance_m, event.accuracy_m, settings)
      ? `${event.distance_m} m from the gym (±${event.accuracy_m} m)`
      : `At the gym · ${event.distance_m} m (±${event.accuracy_m} m)`
  } else if (event) {
    location = { denied: 'Not recorded · permission denied', timeout: 'Not recorded · timed out', unavailable: 'Not recorded · unavailable', ok: 'Not recorded' }[
      event.location_status
    ]
  }

  const chip = (active: boolean) =>
    cn(
      'min-h-12 rounded-xl border px-3 text-[15px] font-medium transition-colors',
      active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background active:bg-muted',
    )

  return (
    <Drawer open onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">
            {name} · {FLAG_LABEL[flag.kind]}
          </DrawerTitle>
          <DrawerDescription className="text-[15px]">{flag.detail}</DrawerDescription>
        </DrawerHeader>

        <div className="overflow-y-auto px-4">
          {correcting && event ? (
            <p className="border-y border-border py-2.5 text-[15px] text-muted-foreground">
              {kindLabel} now {formatClock(event.effective_time, tz)} · {formatDateShort(localDay(event.effective_time, tz))}
            </p>
          ) : (
            <dl className="divide-y divide-border border-y border-border">
              <Fact label="Shift" value={shift ? `${formatDateShort(shift.date)} · ${shift.type === 'morning' ? 'Morning' : 'Night'} ${formatTimeRange(shift.start_time, shift.end_time)}` : 'Not rostered'} />
              {event && (
                <Fact
                  label={kindLabel}
                  value={`${formatDateShort(localDay(event.effective_time, tz))}, ${formatClock(event.effective_time, tz)}`}
                  note={event.corrected ? `Recorded ${formatClock(event.server_time, tz)}` : undefined}
                />
              )}
              {event && <Fact label="Location" value={location} />}
              {event?.voided && <Fact label="Voided" value={formatClock(event.voided.voided_at, tz)} note={`“${event.voided.reason}”`} />}
            </dl>
          )}

          {voiding && voidTarget && (
            <ClockFixForm
              mode="void"
              event={voidTarget}
              name={name}
              viewer={viewer}
              settings={settings}
              onDone={() => {
                onChanged()
                onOpenChange(false)
              }}
              onCancel={() => setVoiding(false)}
            />
          )}

          {!event && <p className="mt-3 text-[15px] text-muted-foreground">There's no clock time to correct for this flag. Talk to {name}, then mark it resolved.</p>}

          {history.length > 0 && !correcting && (
            <div className="mt-4">
              <h3 className="text-sm font-medium">Corrections</h3>
              <ul className="mt-1">
                {history.map((c) => (
                  <li key={c.id} className="py-1.5 text-sm leading-snug">
                    {formatClock(c.old_time, tz)} → {formatClock(c.new_time, tz)}
                    <span className="text-muted-foreground"> · “{c.reason}”</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {event && correcting && (
            <fieldset className="mt-3 space-y-3 pb-1">
              <legend className="text-sm font-medium">Correct the {kindLabel.toLowerCase()} time</legend>
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
              <div className="flex flex-wrap gap-2">
                {quickReasons.map((r) => (
                  <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)} className={chip(reason === r)}>
                    {r}
                  </button>
                ))}
              </div>
              <label htmlFor="fix-reason" className="sr-only">
                Reason
              </label>
              <Textarea id="fix-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (needed)" className="min-h-16 text-base" />
            </fieldset>
          )}
        </div>

        <DrawerFooter className={voiding ? 'hidden' : undefined}>
          <p aria-live="polite" className="text-center text-sm text-warn empty:hidden">
            {error}
          </p>
          {correcting ? (
            <>
              <button
                type="button"
                disabled={busy || unchanged || !reason.trim()}
                onClick={() => void saveCorrection()}
                className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground active:bg-brand-press disabled:bg-muted disabled:text-muted-foreground"
              >
                {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
                Save correction
              </button>
              <button type="button" onClick={() => setCorrecting(false)} className="h-11 rounded-xl text-base font-medium text-muted-foreground active:bg-muted">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => resolveFlag({ flagId: flag.id, resolvedBy: viewer.id }), true)}
                className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground active:bg-brand-press disabled:bg-brand-press"
              >
                {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
                Mark resolved
              </button>
              {event && !event.voided && (
                <button type="button" onClick={() => setCorrecting(true)} className="h-14 rounded-[14px] border border-border text-lg font-medium active:bg-muted">
                  Correct time
                </button>
              )}
              {voidTarget && (
                <button type="button" onClick={() => setVoiding(true)} className="h-11 rounded-xl text-base font-medium text-muted-foreground active:bg-muted">
                  Void this clock-in ({formatClock(voidTarget.effective_time, tz)})
                </button>
              )}
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-[15px] text-muted-foreground">{label}</dt>
      <dd className="text-right text-[15px] font-medium">
        {value}
        {note && <span className="block text-[13px] font-normal text-muted-foreground">{note}</span>}
      </dd>
    </div>
  )
}
