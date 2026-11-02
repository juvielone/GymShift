// Swaps, covers and days off on a cleaner's home (PRD F3): "Can you take these?" (asks from colleagues
// and open shifts), Next shifts with each hand-off's progress, and "Days I can't work".
import { useEffect, useState } from 'react'
import { CalendarX, Check, ChevronRight, Users } from 'lucide-react'
import { answerSwap, getShifts, withdrawSwap } from '@/data'
import type { Shift, SiteSettings, Timestamp, User } from '@/types'
import { useHandoffs, type Ask, type MyHandoff } from '@/hooks/useHandoffs'
import { Disc } from '@/components/common/ListParts'
import { rowClass, smallButton } from '@/components/common/listStyles'
import { UpcomingShifts } from '@/components/home/UpcomingShifts'
import { HandoffSheet } from '@/components/home/HandoffSheet'
import { DaysOffSheet } from '@/components/home/DaysOffSheet'
import { formatDateShort, formatDayRange, formatTimeRange, shortName } from '@/lib/format'

interface Props {
  user: User
  settings: SiteSettings
  now: Timestamp
  upcoming: Shift[]
  /** After a change that moves a shift or a request, so the whole home reloads. */
  onChanged: () => void
}

const shiftLine = (s: Shift) => `${formatDateShort(s.date)} · ${s.type === 'morning' ? 'Morning' : 'Night'} · ${formatTimeRange(s.start_time, s.end_time)}`

export function ShiftHandoffs({ user, settings, now, upcoming, onChanged }: Props) {
  const { data, reload } = useHandoffs(user, settings, now, upcoming)
  const [asking, setAsking] = useState<Shift | null>(null)
  const [daysOpen, setDaysOpen] = useState(false)
  const [nextShifts, setNextShifts] = useState<Shift[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const changed = () => {
    void reload()
    onChanged()
  }

  useEffect(() => {
    if (!data) return
    void getShifts({ userId: user.id, from: data.daysOff.from, to: data.daysOff.to }).then((s) => setNextShifts(s.filter((x) => x.status !== 'cancelled')))
  }, [data, user.id])

  async function run(key: string, save: () => Promise<unknown>) {
    setBusy(key)
    setErrors(({ [key]: _old, ...rest }) => rest)
    try {
      await save()
      changed()
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: e instanceof Error ? e.message : 'Not saved yet. Check your internet and try again.' }))
    } finally {
      setBusy(null)
    }
  }

  const answer = (a: Ask, yes: boolean) => run(a.swap.id, () => answerSwap({ swapId: a.swap.id, userId: user.id, yes }))
  const withdraw = (shift: Shift, h: MyHandoff) => run(shift.id, () => withdrawSwap({ swapId: h.swap.id, userId: user.id }))

  const asks = data?.asks ?? []
  const days = data?.daysOff

  return (
    <>
      {asks.length > 0 && (
        <section aria-labelledby="asks-title" className="mt-5">
          <h2 id="asks-title" className="flex items-center gap-2 px-1 pb-1 text-base font-semibold">
            Can you take these?
            <span className="min-w-[22px] rounded-full bg-foreground px-1.5 text-center text-[13px] leading-[22px] font-semibold text-background">
              {asks.filter((a) => !a.agreed).length || asks.length}
            </span>
          </h2>
          <ul>
            {asks.map((a) => {
              const who = shortName(a.requester.full_name)
              const named = a.swap.kind === 'swap'
              if (a.agreed) {
                return (
                  <li key={a.swap.id} className={rowClass}>
                    <Disc tone="ok">
                      <Check strokeWidth={3} />
                    </Disc>
                    <div className="min-w-0 flex-1">
                      <p className="text-base leading-snug font-medium">{`You said yes to ${who}'s shift`}</p>
                      <p className="text-sm leading-snug text-muted-foreground tabular-nums">{shiftLine(a.shift)} · waiting for approval</p>
                    </div>
                  </li>
                )
              }
              return (
                <li key={a.swap.id} className={rowClass}>
                  <Disc tone="neutral">{named ? <span className="text-[15px] font-semibold">{who.charAt(0)}</span> : <Users />}</Disc>
                  <div className="min-w-0 flex-1">
                    <p className="text-base leading-snug font-medium">{named ? `${who} asked you` : `Open shift · ${who} can't make it`}</p>
                    <p className="text-sm leading-snug text-muted-foreground tabular-nums">{shiftLine(a.shift)}</p>
                    {a.swap.reason && <p className="mt-1 text-[15px] leading-snug">“{a.swap.reason}”</p>}
                    {errors[a.swap.id] && (
                      <p role="alert" className="mt-1.5 text-sm text-warn">
                        {errors[a.swap.id]}
                      </p>
                    )}
                    <div className="mt-2.5 flex gap-2">
                      {named && (
                        <button type="button" onClick={() => answer(a, false)} disabled={busy === a.swap.id} className={smallButton.outline}>
                          Not me
                        </button>
                      )}
                      <button type="button" onClick={() => answer(a, true)} disabled={busy === a.swap.id} className={smallButton.ink}>
                        {busy === a.swap.id ? 'Saving…' : "I'll take it"}
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <UpcomingShifts shifts={upcoming} handoffs={data?.mine} busy={busy} onCantMake={setAsking} onWithdraw={withdraw} />
      {Object.entries(errors)
        .filter(([key]) => upcoming.some((s) => s.id === key))
        .map(([key, message]) => (
          <p key={key} role="alert" className="mt-2 px-1 text-sm text-warn">
            {message}
          </p>
        ))}

      {days && (
        <button
          type="button"
          onClick={() => setDaysOpen(true)}
          className="mt-5 flex min-h-14 w-full items-center gap-3 rounded-[14px] border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-muted/60 active:bg-muted"
        >
          <Disc tone="neutral">
            <CalendarX />
          </Disc>
          <span className="min-w-0 flex-1">
            <span className="block text-base leading-snug font-medium">{"Days I can't work"}</span>
            <span className="block text-sm leading-snug text-muted-foreground tabular-nums">
              {days.dates.length === 0
                ? `None marked for ${formatDayRange(days.from, days.to)}`
                : `${days.dates.length} ${days.dates.length === 1 ? 'day' : 'days'} marked in ${formatDayRange(days.from, days.to)}`}
            </span>
          </span>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
        </button>
      )}

      <HandoffSheet shift={asking} userId={user.id} onOpenChange={(o) => !o && setAsking(null)} onSent={changed} />
      {days && (
        <DaysOffSheet
          open={daysOpen}
          onOpenChange={setDaysOpen}
          userId={user.id}
          from={days.from}
          to={days.to}
          marked={days.dates}
          note={days.note}
          rostered={nextShifts}
          onSaved={() => void reload()}
        />
      )}
    </>
  )
}
