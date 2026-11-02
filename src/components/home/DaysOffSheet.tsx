// "Days I can't work" (PRD F3): next fortnight as a Mon–Sun grid. Tap days, Save. A dot marks a day
// you're already rostered; marking it says to ask for cover on that shift instead. Never blocks.
import { useEffect, useState } from 'react'
import { Info, LoaderCircle } from 'lucide-react'
import { setDaysOff } from '@/data'
import type { DateString, Shift } from '@/types'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Textarea } from '@/components/ui/textarea'
import { formatDateShort, formatDayRange } from '@/lib/format'
import { addDays } from '@/lib/rules'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  /** The fortnight shown: its Monday and Sunday a week later. */
  from: DateString
  to: DateString
  /** Days already marked, and their note. */
  marked: DateString[]
  note: string | null
  /** This person's shifts in the fortnight (published or not yet), for the dots. */
  rostered: Shift[]
  onSaved: (count: number) => void
}

const dayNumber = (d: DateString) => Number(d.slice(8, 10))

export function DaysOffSheet({ open, onOpenChange, userId, from, to, marked, note, rostered, onSaved }: Props) {
  const [picked, setPicked] = useState<Set<DateString>>(new Set(marked))
  const [text, setText] = useState(note ?? '')
  const [tapped, setTapped] = useState<DateString | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPicked(new Set(marked))
    setText(note ?? '')
    setTapped(null)
    setError(null)
  }, [open, marked, note])

  const days = Array.from({ length: 14 }, (_, i) => addDays(from, i))
  const onDay = new Set(rostered.map((s) => s.date))

  function toggle(d: DateString) {
    const next = new Set(picked)
    if (next.has(d)) next.delete(d)
    else next.add(d)
    setPicked(next)
    setTapped(next.has(d) && onDay.has(d) ? d : null)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await setDaysOff({ userId, from, to, dates: [...picked].sort(), note: text })
      onSaved(picked.size)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not saved yet. Check your internet and try again.')
    } finally {
      setSaving(false)
    }
  }

  const unchanged = picked.size === marked.length && marked.every((d) => picked.has(d)) && text.trim() === (note ?? '')

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">{"Days I can't work"}</DrawerTitle>
          <DrawerDescription className="text-[15px]">
            {formatDayRange(from, to)}. Carly and Gladys will roster around them.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-4">
          <div>
            <div className="grid grid-cols-7 gap-1.5 tabular-nums">
              {WEEKDAYS.map((w) => (
                <span key={w} aria-hidden className="pb-0.5 text-center text-[13px] font-medium text-muted-foreground">
                  {w}
                </span>
              ))}
              {days.map((d) => {
                const on = picked.has(d)
                const working = onDay.has(d)
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${formatDateShort(d)}${working ? ', you are rostered' : ''}`}
                    onClick={() => toggle(d)}
                    className={cn(
                      'flex h-[52px] flex-col items-center justify-center rounded-[14px] border text-lg font-semibold transition-colors',
                      on ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:bg-muted active:bg-muted',
                    )}
                  >
                    {dayNumber(d)}
                    {working && <span aria-hidden className={cn('mt-0.5 size-[5px] rounded-full', on ? 'bg-background' : 'bg-muted-foreground')} />}
                  </button>
                )
              })}
            </div>
            <p className="mt-2.5 flex gap-2 px-1 text-sm leading-snug text-muted-foreground">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {tapped
                ? `You're on ${formatDateShort(tapped)}. Ask for cover on that shift instead.`
                : "A dot means you're on that day."}
            </p>
          </div>

          <div>
            <label htmlFor="days-off-note" className="mb-2 block px-1 text-[13px] font-medium text-muted-foreground">
              Note for Carly (you can skip this)
            </label>
            <Textarea id="days-off-note" value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: Uni exam" className="min-h-12 text-base" />
          </div>
        </div>

        <DrawerFooter>
          <p aria-live="polite" className="text-center text-sm text-warn empty:hidden">
            {error}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={saving || unchanged}
            className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press disabled:bg-muted disabled:text-muted-foreground"
          >
            {saving && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
            {picked.size === 0 ? 'Save · no days' : `Save ${picked.size} ${picked.size === 1 ? 'day' : 'days'}`}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-[14px] text-base font-medium text-muted-foreground transition-colors active:bg-muted"
          >
            Cancel
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
