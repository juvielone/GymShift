// When did they really finish? Two cases, both decided by Carly:
// - 'late': clocked out past the approved finish. "I stayed to finish" asks for the extra time (an extension,
//   up to the request limit); "I forgot to clock out" sends the time they left.
// - 'auto': they never clocked out and the job closed the shift at its end. "That's right" confirms it;
//   "I finished at a different time" sends that time.
// The recorded time stays as it is until Carly approves; nothing here changes hours by itself.
import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { requestEndTime, requestExtension } from '@/data'
import type { SiteSettings } from '@/types'
import type { Session } from '@/hooks/useCleanerHome'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { formatClock, formatDateShort, formatDuration, localDay, localTime, zonedTimestamp } from '@/lib/format'
import { addDays, compareTs, minutesBetween } from '@/lib/rules'

export type FinishMode = 'late' | 'auto'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: FinishMode
  /** A closed session: clockOut is set. */
  session: Session
  userId: string
  settings: SiteSettings
  onSent: (message: { title: string; detail: string }) => void
}

const STAYED = 'Stayed to finish'

export function FinishTimeSheet({ open, onOpenChange, mode, session, userId, settings, onSent }: Props) {
  const tz = settings.timezone
  const clockOut = session.clockOut!
  const finish = new Date(Date.parse(session.clockIn.effective_time) + session.approvedMin * 60_000).toISOString()
  const suggested = mode === 'auto' ? clockOut.effective_time : finish
  const overMin = minutesBetween(finish, clockOut.effective_time)
  // "Stayed": the extra minutes, as far as one request and the shift's maximum allow.
  const room = Math.min(settings.max_extension_request_min, settings.max_shift_min - session.approvedMin)
  const canStay = mode === 'late' && session.shift !== null && room > 0

  const [picking, setPicking] = useState(false)
  const [time, setTime] = useState(localTime(suggested, tz))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setPicking(false)
    setTime(localTime(suggested, tz))
    setError(null)
  }

  /** The picked time on the clock-out's day, or the day before when that would be after the clock-out. */
  const pickedTs = () => {
    const day = localDay(clockOut.server_time, tz)
    const same = zonedTimestamp(day, time, tz)
    return compareTs(same, clockOut.server_time) > 0 ? zonedTimestamp(addDays(day, -1), time, tz) : same
  }

  async function run(send: () => Promise<unknown>, message: { title: string; detail: string }) {
    setSending(true)
    setError(null)
    try {
      await send()
      onSent(message)
      onOpenChange(false)
      reset()
    } catch (e) {
      setError(e instanceof Error && /^(Carly|Pick)/.test(e.message) ? e.message : 'Not sent yet. Check your internet and try again.')
    } finally {
      setSending(false)
    }
  }

  const sendTime = () => {
    const at = pickedTs()
    if (compareTs(at, session.clockIn.effective_time) <= 0) {
      setError(`Pick a time after you clocked in at ${formatClock(session.clockIn.effective_time, tz)}.`)
      return
    }
    void run(() => requestEndTime({ clockEventId: clockOut.id, userId, reasonCode: 'forgot_clock_out', requestedTime: at }), {
      title: 'Sent to Carly.',
      detail: `You said you finished at ${formatClock(at, tz)}. Your hours change once she approves it.`,
    })
  }

  const stayed = () => {
    const minutes = Math.min(overMin, room)
    void run(() => requestExtension({ shiftId: session.shift!.id, requestedBy: userId, minutes, reason: STAYED }), {
      title: `Asked for ${formatDuration(minutes)} more.`,
      detail: 'Carly will reply here. Your time is saved as you clocked it.',
    })
  }

  const confirm = () =>
    void run(() => requestEndTime({ clockEventId: clockOut.id, userId, reasonCode: 'confirm_auto_close' }), {
      title: 'Thanks. Sent to Carly.',
      detail: `Your shift ends at ${formatClock(clockOut.effective_time, tz)}.`,
    })

  const title =
    mode === 'auto'
      ? "You didn't clock out"
      : `You clocked out ${formatDuration(overMin)} after your ${formatClock(finish, tz)} finish`
  const description =
    mode === 'auto'
      ? `We closed your ${session.shift ? `${formatDateShort(session.shift.date)} shift` : 'session'} at ${formatClock(clockOut.effective_time, tz)}. Is that right?`
      : 'What happened? Carly will check it.'

  const primary = 'flex h-14 items-center justify-center gap-2 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press disabled:bg-muted disabled:text-muted-foreground'
  const secondary = 'flex h-14 items-center justify-center rounded-[14px] border border-border text-lg font-medium active:bg-muted disabled:text-muted-foreground'

  return (
    <Drawer open={open} onOpenChange={(o) => (onOpenChange(o), !o && reset())}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">{title}</DrawerTitle>
          <DrawerDescription className="text-[15px]">{description}</DrawerDescription>
        </DrawerHeader>

        {picking && (
          <div className="px-4">
            <label htmlFor="finish-time" className="mb-2 block text-sm font-medium">
              When did you finish?
            </label>
            <input
              id="finish-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="h-14 w-full rounded-xl border border-border bg-background px-4 text-lg"
            />
            <p className="mt-2 text-sm text-muted-foreground">
              You clocked in at {formatClock(session.clockIn.effective_time, tz)}
              {mode === 'late' ? ` and out at ${formatClock(clockOut.server_time, tz)}` : ''}.
            </p>
          </div>
        )}

        <DrawerFooter>
          <p aria-live="polite" className="text-center text-sm text-warn empty:hidden">
            {error}
          </p>
          {picking ? (
            <button type="button" onClick={sendTime} disabled={!time || sending} className={primary}>
              {sending && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
              Send to Carly
            </button>
          ) : mode === 'auto' ? (
            <>
              <button type="button" onClick={confirm} disabled={sending} className={primary}>
                {sending && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
                That's right
              </button>
              <button type="button" onClick={() => setPicking(true)} disabled={sending} className={secondary}>
                I finished at a different time
              </button>
            </>
          ) : (
            <>
              {canStay && (
                <button type="button" onClick={stayed} disabled={sending} className={primary}>
                  {sending && <LoaderCircle aria-hidden className="size-5 animate-spin" />}I stayed to finish
                </button>
              )}
              <button type="button" onClick={() => setPicking(true)} disabled={sending} className={canStay ? secondary : primary}>
                I forgot to clock out
              </button>
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
