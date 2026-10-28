// Next shifts: the first few tucked under each other like passes; one tap fans them into a full list.
import { useState } from 'react'
import { ChevronDown, Moon, Sunrise } from 'lucide-react'
import type { Shift } from '@/types'
import { formatDateShort, formatTimeRange } from '@/lib/format'
import { cn } from '@/lib/utils'

const STACKED = 3

export function UpcomingShifts({ shifts }: { shifts: Shift[] }) {
  const [open, setOpen] = useState(false)

  return (
    <section aria-labelledby="upcoming-title" className="mt-5">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h2 id="upcoming-title" className="text-base font-semibold">
          Next shifts
        </h2>
        {shifts.length > 1 && (
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
        <ol id="upcoming-list" className={cn('grid transition-[gap] duration-300 ease-out', open ? 'gap-2' : 'gap-0')}>
          {(open ? shifts : shifts.slice(0, STACKED)).map((s, i) => {
            const Icon = s.type === 'morning' ? Sunrise : Moon
            const tucked = !open && i > 0
            return (
              <li
                key={s.id}
                style={tucked ? { marginTop: -8, transform: `scale(${1 - i * 0.03})`, zIndex: STACKED - i } : { zIndex: STACKED - i }}
                className={cn(
                  'relative flex items-center gap-3 rounded-[14px] border border-border px-4 py-3.5 shadow-[0_2px_6px_-2px_rgb(0_0_0/0.08)] transition-[transform,margin] duration-300 ease-out motion-reduce:transition-none',
                  tucked ? 'bg-muted' : 'bg-background',
                )}
              >
                <Icon aria-hidden className="size-[18px] shrink-0 text-muted-foreground" />
                <span className="flex-1 text-base font-medium">
                  {formatDateShort(s.date)}
                  <span className="font-normal text-muted-foreground"> · {s.type === 'morning' ? 'Morning' : 'Night'}</span>
                </span>
                <span className="text-[15px] text-muted-foreground">
                  {formatTimeRange(s.start_time, s.end_time)}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
