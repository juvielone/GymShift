// The fortnight roster for Carly (and Gladys on her behalf): 14 days, a morning and a night slot
// each. Tap a slot, tap a name. Drafts stay hidden from staff until "Publish"; edits to published
// shifts are logged. Unavailability and double bookings are shown as warnings, never blocked.
import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, LoaderCircle, Plus, X } from 'lucide-react'
import { copyFortnight, publishFortnight } from '@/data'
import type { RosterWarningKind } from '@/data'
import type { DateString, Shift, ShiftType } from '@/types'
import { initialFortnight, useRoster, type Roster } from '@/hooks/useRoster'
import { ShiftSheet, type Slot } from '@/components/roster/ShiftSheet'
import { smallButton } from '@/components/common/listStyles'
import { firstName, formatDateShort, formatTimeRange } from '@/lib/format'
import { addDays, fortnightStartOf, localDate } from '@/lib/rules'
import { cn } from '@/lib/utils'

const TYPES: ShiftType[] = ['morning', 'night']
const TYPE_LABEL: Record<ShiftType, string> = { morning: 'Morning', night: 'Night' }
const WARN_TEXT: Record<RosterWarningKind, (note: string | null) => string> = {
  unavailable: (note) => `Unavailable${note ? ` · ${note}` : ''}`,
  double_booked: () => 'Two shifts this day',
  inactive: () => 'No longer active, reassign this shift',
}
/** How far ahead Carly can roster, in fortnights after the current one. */
const FORTNIGHTS_AHEAD = 2

export function RosterPage({ onBack }: { onBack: () => void }) {
  const [start, setStart] = useState<DateString | null>(null)
  const { data, error, refresh } = useRoster(start)

  useEffect(() => {
    void initialFortnight().then(setStart)
  }, [])

  return (
    <main className="mx-auto min-h-svh max-w-[480px] px-4 pb-[calc(env(safe-area-inset-bottom)+112px)] lg:max-w-3xl">
      <header className="flex h-12 items-center">
        <button type="button" onClick={onBack} className="-ml-2 flex h-11 items-center gap-1 rounded-xl px-2 text-[15px] font-medium hover:bg-muted active:bg-muted">
          <ChevronLeft aria-hidden className="size-5" />
          Back
        </button>
      </header>
      {error && !data ? (
        <div className="pt-20 text-center">
          <p className="text-lg font-medium">We couldn't load the roster.</p>
          <button type="button" onClick={() => void refresh()} className={`${smallButton.outline} mt-4`}>
            Try again
          </button>
        </div>
      ) : !data || data.start !== start ? (
        <div role="status" aria-label="Loading" className="px-1 pt-1">
          <div className="h-8 w-28 rounded-md bg-muted" />
          <div className="mt-6 h-64 rounded-[18px] bg-muted motion-safe:animate-pulse" />
        </div>
      ) : (
        <RosterView roster={data} onMove={setStart} refresh={refresh} />
      )}
    </main>
  )
}

function RosterView({ roster, onMove, refresh }: { roster: Roster; onMove: (start: DateString) => void; refresh: () => Promise<void> }) {
  const { me, settings, now, start, shifts, cancelled, warnings, changes, previousCount } = roster
  const [slot, setSlot] = useState<Slot | null>(null)
  const [receipt, setReceipt] = useState<string | null>(null)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [busy, setBusy] = useState<'copy' | 'publish' | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const today = localDate(now, settings)
  const current = fortnightStartOf(today, settings)
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i))
  const drafts = shifts.filter((s) => s.status === 'draft')
  const publishedCount = shifts.length - drafts.length
  const emptySlots = days.length * TYPES.length - shifts.length
  const at = (date: DateString, type: ShiftType) => shifts.find((s) => s.date === date && s.type === type) ?? null
  const changedIds = new Set(changes.map((c) => c.shift_id))
  const nameOf = (id: string) => firstName(roster.users.find((u) => u.id === id)?.full_name ?? 'Someone')

  const status =
    shifts.length === 0
      ? 'Nothing rostered yet'
      : drafts.length === 0
        ? `Published · ${publishedCount} shifts · staff can see it`
        : publishedCount === 0
          ? `Draft · ${drafts.length} ${drafts.length === 1 ? 'shift' : 'shifts'} · staff can't see it yet`
          : `${drafts.length} unpublished ${drafts.length === 1 ? 'change' : 'changes'} · staff see the rest`

  function move(to: DateString) {
    setReceipt(null)
    setConfirmPublish(false)
    onMove(to)
  }

  async function act(kind: 'copy' | 'publish') {
    setBusy(kind)
    setFailed(null)
    try {
      if (kind === 'copy') {
        const made = await copyFortnight({ fromStart: addDays(start, -14), toStart: start, createdBy: me.id })
        setReceipt(made.length ? `Copied ${made.length} shifts from last fortnight as drafts. Check the warnings, then publish.` : 'Every slot was already filled.')
      } else {
        const done = await publishFortnight({ fortnightStart: start, publishedBy: me.id })
        setReceipt(`Published ${done.length} ${done.length === 1 ? 'shift' : 'shifts'}. Staff can see them now.`)
        setConfirmPublish(false)
      }
      await refresh()
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Not saved yet. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const nav = 'flex size-11 items-center justify-center rounded-xl border border-border hover:bg-muted active:bg-muted disabled:bg-muted disabled:text-muted-foreground'

  return (
    <>
      <div className="flex items-start justify-between gap-2 px-1 pt-1">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.01em]">Roster</h1>
          <p className="mt-0.5 text-[15px] font-medium">
            {formatDateShort(start)} – {formatDateShort(addDays(start, 13))}
            {start === current && <span className="font-normal text-muted-foreground"> · this fortnight</span>}
          </p>
          <p className="text-sm text-muted-foreground">{status}</p>
        </div>
        <div className="flex shrink-0 gap-1.5 pt-1">
          <button type="button" aria-label="Earlier fortnight" disabled={start <= settings.roster_anchor_date} onClick={() => move(addDays(start, -14))} className={nav}>
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <button type="button" aria-label="Later fortnight" disabled={start >= addDays(current, 14 * FORTNIGHTS_AHEAD)} onClick={() => move(addDays(start, 14))} className={nav}>
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>
      </div>

      <div aria-live="polite" className="empty:hidden">
        {receipt && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-ok-soft px-4 py-3">
            <p className="flex-1 text-[15px] leading-snug font-medium">{receipt}</p>
            <button type="button" onClick={() => setReceipt(null)} aria-label="Dismiss" className="-m-2 flex size-10 shrink-0 items-center justify-center rounded-full">
              <X aria-hidden className="size-5" />
            </button>
          </div>
        )}
      </div>

      {emptySlots > 0 && previousCount > 0 && addDays(start, 13) >= today && (
        <button type="button" onClick={() => void act('copy')} disabled={busy !== null} className={`${smallButton.outline} mt-4 w-full gap-2`}>
          {busy === 'copy' ? <LoaderCircle aria-hidden className="size-[18px] animate-spin" /> : <Copy aria-hidden className="size-[18px]" />}
          {shifts.length === 0 ? 'Copy last fortnight' : `Fill ${emptySlots} empty ${emptySlots === 1 ? 'slot' : 'slots'} from last fortnight`}
        </button>
      )}

      <div className="mt-2">
        {days.map((date) => (
          <section key={date} aria-labelledby={`day-${date}`} className={cn(date < today && 'opacity-60')}>
            <h2 id={`day-${date}`} className="px-1 pt-4 pb-0.5 text-[13px] font-medium text-muted-foreground">
              {date === today ? `Today · ${formatDateShort(date)}` : formatDateShort(date)}
            </h2>
            <ul>
              {TYPES.map((type) => {
                const shift = at(date, type)
                const gone = shift ? null : cancelled.find((s) => s.date === date && s.type === type)
                return (
                  <li key={type}>
                    <SlotRow
                      type={type}
                      shift={shift}
                      name={shift ? nameOf(shift.assigned_user_id) : null}
                      cancelledName={gone ? nameOf(gone.assigned_user_id) : null}
                      warning={shift ? warnings.filter((w) => w.shift_id === shift.id) : []}
                      changed={shift !== null && changedIds.has(shift.id)}
                      onOpen={() => setSlot({ date, type })}
                    />
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      {drafts.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pt-3">
          <div className="mx-auto max-w-[480px] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] lg:max-w-3xl">
            {failed && (
              <p role="alert" className="mb-2 rounded-xl bg-warn-soft px-3 py-2.5 text-center text-[15px] font-medium text-warn">
                {failed}
              </p>
            )}
            {confirmPublish && <p className="mb-2 text-center text-[15px]">Staff will see these shifts on their phones straight away.</p>}
            <div className="flex gap-2">
              {confirmPublish && (
                <button type="button" onClick={() => setConfirmPublish(false)} className="h-[58px] flex-1 rounded-[14px] border border-border text-lg font-semibold active:bg-muted">
                  Not yet
                </button>
              )}
              <button
                type="button"
                onClick={() => (confirmPublish ? void act('publish') : setConfirmPublish(true))}
                disabled={busy !== null}
                className="flex h-[58px] flex-[2] items-center justify-center gap-2 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press disabled:bg-brand-press"
              >
                {busy === 'publish' && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
                {confirmPublish ? 'Publish now' : `Publish ${drafts.length} ${drafts.length === 1 ? 'shift' : 'shifts'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {slot && (
        <ShiftSheet
          key={`${slot.date}-${slot.type}`}
          slot={slot}
          shift={at(slot.date, slot.type)}
          roster={roster}
          onOpenChange={(o) => !o && setSlot(null)}
          onChanged={(m) => {
            setReceipt(m)
            setConfirmPublish(false)
            void refresh()
          }}
        />
      )}
    </>
  )
}

interface SlotRowProps {
  type: ShiftType
  shift: Shift | null
  name: string | null
  cancelledName: string | null
  warning: { kind: RosterWarningKind; note: string | null }[]
  changed: boolean
  onOpen: () => void
}

function SlotRow({ type, shift, name, cancelledName, warning, changed, onOpen }: SlotRowProps) {
  const warnText = warning.map((w) => WARN_TEXT[w.kind](w.note)).join(' · ')
  return (
    <button type="button" onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 border-b border-border px-1 py-2.5 text-left hover:bg-muted/60 active:bg-muted">
      <span className="w-[72px] shrink-0 text-sm text-muted-foreground">{TYPE_LABEL[type]}</span>
      <span className="min-w-0 flex-1">
        {shift && name ? (
          <>
            <span className="flex items-center gap-2">
              <span className="text-base leading-snug font-medium">{name}</span>
              {shift.status === 'draft' && <span className="rounded-full border border-dashed border-foreground/40 px-2 text-[13px] leading-[20px] font-medium">Draft</span>}
              {changed && <span className="rounded-full bg-muted px-2 text-[13px] leading-[20px] font-medium">Changed</span>}
            </span>
            <span className="block text-sm leading-snug text-muted-foreground">{formatTimeRange(shift.start_time, shift.end_time)}</span>
            {warnText && (
              <span className="mt-0.5 flex items-center gap-1 text-sm leading-snug text-warn">
                <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
                {warnText}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="flex items-center gap-1 text-base leading-snug font-medium text-muted-foreground">
              <Plus aria-hidden className="size-4" />
              Assign
            </span>
            {cancelledName && <span className="block text-sm text-muted-foreground">Cancelled · was {cancelledName}</span>}
          </>
        )}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </button>
  )
}
