// Pending extra-time, swap/cover and attendance-correction requests with inline Approve / Decline.
// A request is decided once, so each tap waits 5 seconds with Undo before it is saved; once saved,
// the row folds away and never offers Approve / Decline again, even before the list reloads.
// Corrections and after-the-fact extensions show where the phone was at the clock-out, so Carly can judge.
import { useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, Check, Clock, Plus, Undo2, UserRound, X } from 'lucide-react'
import { decideCorrectionRequest, decideExtension, decideSwap } from '@/data'
import type { EffectiveClockEvent } from '@/data'
import type { CorrectionReason, Timestamp, User } from '@/types'
import type { RequestItem } from '@/hooks/requests'
import { Disc } from '@/components/common/ListParts'
import { rowClass, smallButton } from '@/components/common/listStyles'
import { shortName, formatClock, formatDateShort, formatDistance, formatTimeRange, localDay } from '@/lib/format'

const UNDO_MS = 5000

type Pending = { approve: boolean; coveredBy?: string }

const REASON: Record<CorrectionReason, string> = {
  accidental_tap: 'Tapped it by accident',
  wrong_time: 'Wrong time',
  forgot_clock_out: 'Forgot to clock out',
  confirm_auto_close: "That's right",
  other: 'Something else',
}

/** Where the phone was at a clock event: "at the gym (40 m)", "4.2 km from the gym", "no location". */
function whereText(e: EffectiveClockEvent): string {
  if (e.source === 'auto') return 'closed automatically'
  if (e.location_status !== 'ok' || e.distance_m === null) return 'no location'
  return `${formatDistance(e.distance_m)} from the gym`
}

interface Props {
  items: RequestItem[]
  viewer: User
  tz: string
  /** The screen's loaded server time, so "asked at" agrees with the rest of the screen. */
  now: Timestamp
  onChanged: () => void
}

export function RequestList({ items, viewer, tz, now, onChanged }: Props) {
  const [pending, setPending] = useState<Record<string, Pending>>({})
  // Saved decisions keep a snapshot so the row can hold and fold even after the list reloads without it.
  const [settled, setSettled] = useState<Record<string, { item: RequestItem; p: Pending; at: number }>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [cover, setCover] = useState<Record<string, string>>({})
  const timers = useRef(new Map<string, number>())
  const queued = useRef(new Map<string, () => Promise<void>>())
  // Asked today → show the time; earlier → show the date.
  const today = localDay(now, tz)
  const askedAt = (ts: string) => (localDay(ts, tz) === today ? formatClock(ts, tz) : formatDateShort(localDay(ts, tz)))

  async function commit(item: RequestItem, p: Pending) {
    timers.current.delete(item.id)
    queued.current.delete(item.id)
    try {
      if (item.kind === 'extension') await decideExtension({ extensionId: item.id, decidedBy: viewer.id, approve: p.approve })
      else if (item.kind === 'correction') await decideCorrectionRequest({ requestId: item.id, decidedBy: viewer.id, approve: p.approve })
      else await decideSwap({ swapId: item.id, decidedBy: viewer.id, approve: p.approve, coveredBy: p.coveredBy })
      const at = items.findIndex((i) => i.id === item.id)
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setSettled((x) => ({ ...x, [item.id]: { item, p, at } }))
      onChanged()
    } catch (e) {
      setErrors((x) => ({ ...x, [item.id]: e instanceof Error ? e.message : 'Not saved yet. Try again.' }))
    } finally {
      setPending(({ [item.id]: _done, ...rest }) => rest)
    }
  }

  function decide(item: RequestItem, approve: boolean) {
    const p: Pending = { approve, coveredBy: item.kind === 'swap' ? item.other?.id ?? cover[item.id] : undefined }
    setErrors(({ [item.id]: _old, ...rest }) => rest)
    setPending((x) => ({ ...x, [item.id]: p }))
    queued.current.set(item.id, () => commit(item, p))
    timers.current.set(item.id, window.setTimeout(() => void commit(item, p), UNDO_MS))
  }

  function undo(id: string) {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    queued.current.delete(id)
    setPending(({ [id]: _undone, ...rest }) => rest)
  }

  // Leaving the screen never loses a decision: anything still waiting is saved straight away.
  useEffect(() => {
    const t = timers.current
    const q = queued.current
    return () => {
      t.forEach((id) => window.clearTimeout(id))
      q.forEach((save) => void save())
    }
  }, [])

  const forget = (id: string) => setSettled(({ [id]: _gone, ...rest }) => rest)

  // The live list, with any folding snapshots put back where they were.
  const shown = [...items]
  for (const s of Object.values(settled)) if (!shown.some((i) => i.id === s.item.id)) shown.splice(Math.min(s.at, shown.length), 0, s.item)

  return (
    <ul>
      {shown.map((item) => {
        const p = pending[item.id]
        const done = settled[item.id]?.p
        const who = shortName(item.requester.full_name)
        let shiftText = item.shift
          ? `${formatDateShort(item.shift.date)} · ${item.shift.type === 'morning' ? 'Morning' : 'Night'} ${formatTimeRange(item.shift.start_time, item.shift.end_time)}`
          : 'Not rostered'

        let icon = <Plus />
        let title: string
        let reason: string | null
        let asked: string
        let approveLabel = 'Approve'
        let declineLabel = 'Decline'
        if (item.kind === 'extension') {
          title = `${who} · extra ${item.ext.minutes} min`
          reason = item.ext.reason
          asked = askedAt(item.ext.created_at)
          approveLabel = `Approve ${item.ext.minutes} min`
          if (item.clockedOut) shiftText += ` · asked after clocking out at ${formatClock(item.clockedOut.server_time, tz)}, ${whereText(item.clockedOut)}`
        } else if (item.kind === 'correction') {
          const r = item.request
          const inAt = item.clockIn ? formatClock(item.clockIn.effective_time, tz) : null
          if (r.kind === 'void') {
            icon = <Undo2 />
            title = `${who} · clock-in${inAt ? ` at ${inAt}` : ''} was a mistake`
            const out = item.clockOut ? ` · out ${formatClock(item.clockOut.effective_time, tz)}` : ''
            shiftText = `${item.shift ? shiftText : 'Not rostered'} · in ${item.clockIn ? whereText(item.clockIn) : ''}${out}`
            approveLabel = 'Remove clock-in'
            declineLabel = 'Keep it'
          } else {
            icon = <Clock />
            const said = r.requested_time ? formatClock(r.requested_time, tz) : ''
            title = r.reason_code === 'confirm_auto_close' ? `${who} · confirms finish at ${said}` : `${who} · finished at ${said}`
            if (item.clockOut) {
              shiftText += item.clockOut.source === 'auto' ? ` · closed automatically at ${formatClock(item.clockOut.effective_time, tz)}` : ` · clocked out ${formatClock(item.clockOut.server_time, tz)}, ${whereText(item.clockOut)}`
            }
            approveLabel = r.reason_code === 'confirm_auto_close' ? 'Confirm' : `Set ${said}`
            declineLabel = 'Keep as is'
          }
          reason = [REASON[r.reason_code], r.note].filter(Boolean).join(': ')
          asked = askedAt(r.created_at)
        } else {
          icon = item.swap.kind === 'swap' ? <ArrowLeftRight /> : <UserRound />
          const other = item.other ? shortName(item.other.full_name) : null
          title = item.swap.kind === 'swap' ? `${who} ↔ ${other} · swap` : other ? `${who} → ${other} · cover` : `${who} · needs cover`
          reason = item.swap.reason
          asked = askedAt(item.swap.created_at)
        }

        const decision = p ?? done
        if (decision) {
          // Waiting (neutral, can be undone) → saved (green, folds away until the list reloads without it).
          return (
            <li key={item.id} className={done ? 'settle-fold grid' : 'grid'} onAnimationEnd={(e) => e.animationName === 'settle-fold' && forget(item.id)}>
              <div className="relative min-h-0 overflow-hidden border-b border-border">
                <div className="flex items-center gap-3 px-1 py-3" role="status">
                  <Disc tone={done ? (decision.approve ? 'ok' : 'neutral') : 'neutral'}>{decision.approve ? <Check strokeWidth={3} /> : <X />}</Disc>
                  <p className="min-w-0 flex-1 text-base font-medium">
                    {decision.approve ? 'Approved' : 'Declined'} <span className="font-normal text-muted-foreground">· {title}</span>
                  </p>
                  {p && (
                    <button type="button" onClick={() => undo(item.id)} className={smallButton.outline}>
                      Undo
                    </button>
                  )}
                </div>
                {p && <span aria-hidden className="undo-drain absolute bottom-0 left-0 h-0.5 bg-foreground" style={{ animationDuration: `${UNDO_MS}ms` }} />}
              </div>
            </li>
          )
        }

        const needsPerson = item.kind === 'swap' && item.swap.kind === 'cover' && !item.other
        const chosen = needsPerson ? cover[item.id] : undefined
        const blocked = item.kind === 'extension' ? item.blocked : needsPerson && item.candidates.length === 0 ? 'No one else is free that day.' : null

        return (
          <li key={item.id} className={rowClass}>
            <Disc tone="neutral">{icon}</Disc>
            <div className="min-w-0 flex-1 lg:flex lg:items-start lg:gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-base leading-snug font-medium">{title}</p>
                  <span className="shrink-0 text-[13px] text-muted-foreground lg:hidden">{asked}</span>
                </div>
                <p className="text-sm leading-snug text-muted-foreground">
                  {shiftText}
                  <span className="hidden lg:inline"> · asked {asked}</span>
                </p>
                {reason && <p className="mt-1 text-[15px] leading-snug">“{reason}”</p>}
                {blocked && <p className="mt-1.5 text-sm leading-snug text-warn">{blocked}</p>}
                {needsPerson && item.candidates.length > 0 && (
                  <label className="mt-2 block">
                    <span className="sr-only">Who covers?</span>
                    <select
                      value={chosen ?? ''}
                      onChange={(e) => setCover((x) => ({ ...x, [item.id]: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[15px]"
                    >
                      <option value="" disabled>
                        Who covers?
                      </option>
                      {item.candidates.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {errors[item.id] && (
                  <p role="alert" className="mt-1.5 text-sm text-warn">
                    {errors[item.id]}
                  </p>
                )}
              </div>
              <div className="mt-2.5 flex gap-2 lg:mt-0 lg:shrink-0">
                <button type="button" onClick={() => decide(item, false)} className={smallButton.outline}>
                  {declineLabel}
                </button>
                {!blocked && (
                  <button type="button" onClick={() => decide(item, true)} disabled={needsPerson && !chosen} className={smallButton.ink}>
                    {approveLabel}
                  </button>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
