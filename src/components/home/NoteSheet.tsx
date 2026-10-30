// "Note for Carly": open, tap a topic, tap what applies, send. Three taps; typing is optional.
// Running late is offered only before clock-in: it tells Carly about when to expect you and is
// never a task in her list. Supplies low and Something wrong stay on her dashboard until done.
import { useState, type ReactNode } from 'react'
import { CircleAlert, Clock, LoaderCircle, MessageSquare, Package } from 'lucide-react'
import { addNote } from '@/data'
import type { NoteTag, Shift, SiteSettings, Timestamp } from '@/types'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Textarea } from '@/components/ui/textarea'
import { formatClock, zonedTimestamp } from '@/lib/format'
import { compareTs } from '@/lib/rules'
import { cn } from '@/lib/utils'

const TOPICS: { tag: NoteTag; label: string; icon: ReactNode }[] = [
  { tag: 'supplies_low', label: 'Supplies low', icon: <Package /> },
  { tag: 'running_late', label: 'Running late', icon: <Clock /> },
  { tag: 'issue', label: 'Something wrong', icon: <CircleAlert /> },
  { tag: 'general', label: 'Other', icon: <MessageSquare /> },
]
const SUPPLIES = ['Toilet paper', 'Hand soap', 'Paper towels', 'Bin bags', 'Floor cleaner', 'Spray bottles']
const ISSUES = ['Spill or mess', 'Something is broken', 'Blocked toilet or drain', 'Unsafe area']
const LATE_MIN = [5, 10, 15, 30]

export interface NoteSent {
  tag: NoteTag
  /** Running late only: when Carly now expects them. */
  arriveBy: Timestamp | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: Shift
  /** Running late only makes sense before clocking in. */
  beforeClockIn: boolean
  userId: string
  settings: SiteSettings
  now: Timestamp
  onSent: (sent: NoteSent) => void
}

export function NoteSheet({ open, onOpenChange, shift, beforeClockIn, userId, settings, now, onSent }: Props) {
  const topics = TOPICS.filter((t) => t.tag !== 'running_late' || beforeClockIn)
  const firstTopic: NoteTag = beforeClockIn ? 'running_late' : 'supplies_low'
  const [tag, setTag] = useState<NoteTag>(firstTopic)
  const [items, setItems] = useState<string[]>([])
  const [issue, setIssue] = useState<string | null>(null)
  const [lateMin, setLateMin] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setTag(firstTopic)
    setItems([])
    setIssue(null)
    setLateMin(null)
    setText('')
    setError(null)
  }

  // Late from the shift's start, or from now if the start has already passed.
  const start = zonedTimestamp(shift.date, shift.start_time, settings.timezone)
  const lateFrom = compareTs(now, start) > 0 ? now : start
  const arriveBy = lateMin ? new Date(Date.parse(lateFrom) + lateMin * 60_000).toISOString() : null

  const extra = text.trim()
  const body =
    tag === 'supplies_low'
      ? [items.join(', '), extra].filter(Boolean).join('. ')
      : tag === 'issue'
        ? [issue, extra].filter(Boolean).join('. ')
        : tag === 'running_late'
          ? lateMin
            ? `About ${lateMin} min late${extra ? `. ${extra}` : ''}`
            : ''
          : extra
  const ready = body.length > 0 && (tag !== 'running_late' || arriveBy !== null)

  async function send() {
    if (!ready) return
    setSending(true)
    setError(null)
    try {
      await addNote({ shiftId: shift.id, userId, body, tag, arriveBy: arriveBy ?? undefined })
      onSent({ tag, arriveBy })
      onOpenChange(false)
      reset()
    } catch {
      setError('Not sent yet. Check your internet and try again.')
    } finally {
      setSending(false)
    }
  }

  const chip = (active: boolean) =>
    cn(
      'inline-flex min-h-12 items-center gap-2 rounded-[14px] border px-3 text-base font-medium transition-colors [&_svg]:size-[18px] [&_svg]:shrink-0',
      active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:bg-muted active:bg-muted',
    )
  const toggle = (item: string) => setItems((list) => (list.includes(item) ? list.filter((i) => i !== item) : [...list, item]))

  return (
    <Drawer open={open} onOpenChange={(o) => (onOpenChange(o), !o && reset())}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">Note for Carly</DrawerTitle>
          <DrawerDescription className="text-[15px]">She sees it on her dashboard.</DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">What is it about?</legend>
            <div className="grid grid-cols-2 gap-2">
              {topics.map((t) => (
                <button key={t.tag} type="button" aria-pressed={tag === t.tag} onClick={() => setTag(t.tag)} className={chip(tag === t.tag)}>
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>

          {tag === 'supplies_low' && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">What is running low?</legend>
              <div className="flex flex-wrap gap-2">
                {SUPPLIES.map((s) => (
                  <button key={s} type="button" aria-pressed={items.includes(s)} onClick={() => toggle(s)} className={chip(items.includes(s))}>
                    {s}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {tag === 'issue' && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">What happened?</legend>
              <div className="flex flex-wrap gap-2">
                {ISSUES.map((s) => (
                  <button key={s} type="button" aria-pressed={issue === s} onClick={() => setIssue(issue === s ? null : s)} className={chip(issue === s)}>
                    {s}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {tag === 'running_late' && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">About how late?</legend>
              <div className="grid grid-cols-4 gap-2">
                {LATE_MIN.map((m) => (
                  <button key={m} type="button" aria-pressed={lateMin === m} onClick={() => setLateMin(m)} className={cn(chip(lateMin === m), 'justify-center px-0')}>
                    {m} min
                  </button>
                ))}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {arriveBy ? `Carly will see: arriving about ${formatClock(arriveBy, settings.timezone)}.` : 'Your time starts when you clock in.'}
              </p>
            </fieldset>
          )}

          <div>
            <label htmlFor="note-text" className={cn(tag === 'general' ? 'mb-2 block text-sm font-medium' : 'sr-only')}>
              {tag === 'general' ? 'Your note' : 'Anything else'}
            </label>
            <Textarea
              id="note-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={tag === 'general' ? 'Write your note' : 'Anything else? (you can skip this)'}
              className="min-h-20 text-base"
            />
          </div>
        </div>

        <DrawerFooter>
          <p aria-live="polite" className="text-center text-sm text-warn empty:hidden">
            {error}
          </p>
          <button
            type="button"
            onClick={send}
            disabled={!ready || sending}
            className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press disabled:bg-muted disabled:text-muted-foreground"
          >
            {sending && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
            Send to Carly
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
