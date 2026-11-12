// Next shifts: one card per shift, the first three shown, the rest one tap away. Each card's foot says
// where a hand-off is up to (PRD F3) and offers the one next step: "Can't make it?" or Withdraw. A note
// from Carly or the team lead that the cleaner has already seen sits on its shift's card (PRD F8).
import { useState } from 'react'
import { Check, ChevronDown, ClipboardList, Hourglass, Moon, Sunrise } from 'lucide-react'
import type { Shift } from '@/types'
import { footText, type MyHandoff } from '@/hooks/useHandoffs'
import { formatDateShort, formatTimeRange } from '@/lib/format'
import { cn } from '@/lib/utils'

const SHOWN = 3

interface Props {
  shifts: Shift[]
  handoffs?: Map<string, MyHandoff>
  /** Shift id while its Withdraw is saving. */
  busy?: string | null
  onCantMake?: (shift: Shift) => void
  onWithdraw?: (shift: Shift, handoff: MyHandoff) => void
  /** Seen notes for the shift, by shift id: who wrote it and what it says. */
  notes?: Map<string, { id: string; from: string; body: string }[]>
}

export function UpcomingShifts({ shifts, handoffs, busy, onCantMake, onWithdraw, notes }: Props) {
  const [open, setOpen] = useState(false)
  const list = open ? shifts : shifts.slice(0, SHOWN)

  return (
    <section aria-labelledby="upcoming-title" className="mt-5">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h2 id="upcoming-title" className="text-base font-semibold">
          Next shifts
        </h2>
        {shifts.length > SHOWN && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="upcoming-list"
            className="-my-2 flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-muted-foreground"
          >
            {open ? 'Show less' : `Show all ${shifts.length}`}
            <ChevronDown aria-hidden className={cn('size-4 transition-transform duration-300 motion-reduce:transition-none', open && 'rotate-180')} />
          </button>
        )}
      </div>

      {shifts.length === 0 ? (
        <p className="rounded-[14px] bg-muted px-4 py-3.5 text-[15px] text-muted-foreground">No more shifts this fortnight.</p>
      ) : (
        <ol id="upcoming-list" className="grid gap-2">
          {list.map((s) => {
            const Icon = s.type === 'morning' ? Sunrise : Moon
            const h = handoffs?.get(s.id)
            const foot = footText(h)
            const pending = h?.kind === 'waiting' || h?.kind === 'agreed'
            return (
              <li key={s.id} className="rounded-[14px] border border-border bg-background shadow-[0_2px_6px_-2px_rgb(0_0_0/0.08)]">
                <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5">
                  <Icon aria-hidden className="size-[18px] shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-base font-medium">
                    {formatDateShort(s.date)}
                    <span className="font-normal text-muted-foreground"> · {s.type === 'morning' ? 'Morning' : 'Night'}</span>
                  </span>
                  <span className="text-[15px] text-muted-foreground">{formatTimeRange(s.start_time, s.end_time)}</span>
                </div>
                {notes?.get(s.id)?.map((n) => (
                  <div key={n.id} className="flex gap-2 border-t border-border px-4 py-2.5 text-[15px] leading-snug">
                    <ClipboardList aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <p className="min-w-0 whitespace-pre-line">
                      <span className="font-medium">From {n.from}:</span> {n.body}
                    </p>
                  </div>
                ))}
                {(onCantMake || foot) && (
                  <div className="flex min-h-11 items-center gap-2 border-t border-border pr-1.5 pb-1 pl-4">
                    <span className={cn('flex flex-1 items-center gap-1.5 py-2 text-sm leading-snug', foot?.tone === 'ok' ? 'text-ok' : 'text-muted-foreground')}>
                      {foot?.icon === 'wait' && <Hourglass aria-hidden className="size-4 shrink-0" />}
                      {foot?.icon === 'ok' && <Check aria-hidden className="size-4 shrink-0" />}
                      {foot?.text}
                    </span>
                    {pending && onWithdraw && h ? (
                      <button
                        type="button"
                        onClick={() => onWithdraw(s, h)}
                        disabled={busy === s.id}
                        className="h-11 shrink-0 rounded-[14px] px-2.5 text-[15px] font-semibold transition-colors hover:bg-muted active:bg-muted disabled:text-muted-foreground"
                      >
                        {busy === s.id ? 'Withdrawing…' : 'Withdraw'}
                      </button>
                    ) : (
                      onCantMake && (
                        <button
                          type="button"
                          onClick={() => onCantMake(s)}
                          className="h-11 shrink-0 rounded-[14px] px-2.5 text-[15px] font-semibold transition-colors hover:bg-muted active:bg-muted"
                        >
                          {h?.kind === 'said_no' ? 'Ask someone else' : "Can't make it?"}
                        </button>
                      )
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
