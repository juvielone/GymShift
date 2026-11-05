// Notes for the shift on the cleaner home (PRD F8), under the pass. A new note from Carly or the team lead
// is a white card with a "New" pill and "Got it" (one tap, so whoever wrote it knows it was seen). Once
// seen, a note on today's shift stays here as a quiet row until clock-out; one on a later shift moves into
// that shift's card in Next shifts.
import { Check, ClipboardList, LoaderCircle } from 'lucide-react'
import type { ShiftNote } from '@/data'
import type { Shift, SiteSettings, Timestamp } from '@/types'
import type { ShiftNotes } from '@/hooks/useShiftNotes'
import { Disc } from '@/components/common/ListParts'
import { smallButton } from '@/components/common/listStyles'
import { formatDateShort, formatTime } from '@/lib/format'
import { localDate } from '@/lib/rules'
import { cn } from '@/lib/utils'

interface Props {
  settings: SiteSettings
  now: Timestamp
  /** Today's shift (before or during it) and the next ones, soonest first. */
  shifts: Shift[]
  shiftNotes: ShiftNotes
}

export function ShiftNotesCard({ settings, now, shifts, shiftNotes }: Props) {
  const { notes, authorName, busy, error, gotIt } = shiftNotes
  const today = localDate(now, settings)
  const shiftOf = (n: ShiftNote) => shifts.find((s) => s.id === n.shift_id)
  const isToday = (n: ShiftNote) => shiftOf(n)?.date === today
  // New notes on any shift, and every note on today's shift. Seen notes on later shifts live on their card.
  const shown = notes
    .filter((n) => n.seen_at === null || isToday(n))
    .sort((a, b) => shifts.findIndex((s) => s.id === a.shift_id) - shifts.findIndex((s) => s.id === b.shift_id))

  if (shown.length === 0) return null

  /** "Today, 7:00 pm" or "Thu 5 Nov, 7:00 am": which shift it is for. */
  const when = (n: ShiftNote) => {
    const s = shiftOf(n)
    return s ? `${s.date === today ? 'Today' : formatDateShort(s.date)}, ${formatTime(s.start_time)}` : ''
  }

  return (
    <section aria-labelledby="shift-notes-title" className="mt-4">
      <h2 id="shift-notes-title" className="sr-only">
        Notes for your shifts
      </h2>
      <ul aria-live="polite" className="flex flex-col gap-2">
        {shown.map((n) =>
          n.seen_at === null ? (
            <li key={n.id} className="rounded-[14px] border border-border bg-background p-3.5 shadow-[0_2px_6px_-2px_rgb(0_0_0/0.08)]">
              <div className="flex gap-3">
                <Disc tone="neutral">
                  <ClipboardList />
                </Disc>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="text-base leading-snug font-semibold">From {authorName(n)}</span>
                    <span className="rounded-full bg-foreground px-2 text-[13px] leading-[22px] font-semibold text-background">New</span>
                  </p>
                  <p className="text-sm leading-snug whitespace-nowrap text-muted-foreground tabular-nums">For {when(n)}</p>
                  <p className="mt-1.5 text-base leading-snug whitespace-pre-line">{n.body}</p>
                  <button type="button" onClick={() => void gotIt(n)} disabled={busy !== null} className={cn(smallButton.ink, 'mt-3 gap-2')}>
                    {busy === n.id ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" strokeWidth={3} />}
                    Got it
                  </button>
                </div>
              </div>
            </li>
          ) : (
            <li key={n.id} className="flex gap-3 border-b border-border px-1 py-3">
              <Disc tone="neutral">
                <ClipboardList />
              </Disc>
              <div className="min-w-0 flex-1">
                <p className="text-base leading-snug font-medium">From {authorName(n)}</p>
                <p className="mt-0.5 text-[15px] leading-snug whitespace-pre-line">{n.body}</p>
                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                  <Check aria-hidden className="size-3.5" strokeWidth={3} />
                  {`${authorName(n)} knows you've seen it`}
                </p>
              </div>
            </li>
          ),
        )}
      </ul>
      {error && (
        <p role="alert" className="mt-2 px-1 text-sm text-warn">
          {error}
        </p>
      )}
    </section>
  )
}
