// "Can't make it?" (PRD F3): pick a free colleague, or anyone who's free, and ask. Three taps: open,
// pick, Ask. A reason is optional. They say yes first; then Carly or Gladys approves.
import { useEffect, useState, type ReactNode } from 'react'
import { Check, LoaderCircle, Users } from 'lucide-react'
import { getSwapCandidates, requestSwap } from '@/data'
import type { Shift, User } from '@/types'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { formatDateShort, formatTimeRange, shortName } from '@/lib/format'
import { cn } from '@/lib/utils'

const REASONS = ['Sick', 'Family', 'Other']
/** The "Anyone who's free" choice. */
const ANYONE = 'anyone'

interface Props {
  shift: Shift | null
  userId: string
  onOpenChange: (open: boolean) => void
  onSent: () => void
}

export function HandoffSheet({ shift, userId, onOpenChange, onSent }: Props) {
  const [people, setPeople] = useState<User[] | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPeople(null)
    setPick(null)
    setReason(null)
    setError(null)
    if (shift) void getSwapCandidates(shift.id).then(setPeople)
  }, [shift])

  async function send() {
    if (!shift || !pick) return
    setSending(true)
    setError(null)
    try {
      await requestSwap({ shiftId: shift.id, requestedBy: userId, targetUserId: pick === ANYONE ? null : pick, reason })
      onSent()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not sent yet. Check your internet and try again.')
    } finally {
      setSending(false)
    }
  }

  const chosen = people?.find((p) => p.id === pick)
  const label = pick === ANYONE ? 'Ask everyone free' : chosen ? `Ask ${shortName(chosen.full_name)}` : 'Ask'
  const row = (id: string, disc: ReactNode, name: string, detail: string) => (
    <li key={id}>
      <button
        type="button"
        aria-pressed={pick === id}
        onClick={() => setPick(id)}
        className="flex min-h-14 w-full items-center gap-3 border-b border-border px-1 py-2.5 text-left transition-colors hover:bg-muted/60 active:bg-muted"
      >
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-[15px] font-semibold [&_svg]:size-[18px]">
          {disc}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-base leading-snug', pick === id ? 'font-semibold' : 'font-medium')}>{name}</span>
          <span className="block text-sm leading-snug text-muted-foreground">{detail}</span>
        </span>
        <span className="flex size-6 shrink-0 items-center justify-center">{pick === id && <Check aria-hidden className="size-5" />}</span>
      </button>
    </li>
  )

  return (
    <Drawer open={!!shift} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">{shift ? `Can't make ${formatDateShort(shift.date)}?` : "Can't make it?"}</DrawerTitle>
          <DrawerDescription className="text-[15px]">
            {shift && `${shift.type === 'morning' ? 'Morning' : 'Night'} · ${formatTimeRange(shift.start_time, shift.end_time)}. `}
            {"We'll ask them first. Then Carly or Gladys approves."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-4">
          <fieldset>
            <legend className="mb-1 px-1 text-[13px] font-medium text-muted-foreground">Who could take it?</legend>
            {people === null ? (
              <p className="px-1 py-3 text-[15px] text-muted-foreground">Checking who is free…</p>
            ) : (
              <ul>
                {people.map((p) => row(p.id, shortName(p.full_name).charAt(0), shortName(p.full_name), 'Free then'))}
                {row(ANYONE, <Users />, "Anyone who's free", 'Everyone free then can see it')}
              </ul>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 px-1 text-[13px] font-medium text-muted-foreground">Reason (you can skip this)</legend>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={reason === r}
                  onClick={() => setReason(reason === r ? null : r)}
                  className={cn(
                    'min-h-12 rounded-[14px] border px-4 text-base font-medium transition-colors',
                    reason === r ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:bg-muted active:bg-muted',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <DrawerFooter>
          <p aria-live="polite" className="text-center text-sm text-warn empty:hidden">
            {error}
          </p>
          <button
            type="button"
            onClick={send}
            disabled={!pick || sending}
            className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press disabled:bg-muted disabled:text-muted-foreground"
          >
            {sending && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
            {label}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-[14px] text-base font-medium text-muted-foreground transition-colors active:bg-muted"
          >
            Keep my shift
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
