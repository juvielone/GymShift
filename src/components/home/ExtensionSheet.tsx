// Ask for extra time: open, tap a quick reason, send — three taps. The smallest amount is
// pre-selected (the cautious default for Carly); one more tap changes it.
// Options come from site settings and what's still approvable on this shift; Carly decides.
import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { requestExtension } from '@/data'
import type { SiteSettings } from '@/types'
import type { Session } from '@/hooks/useCleanerHome'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Textarea } from '@/components/ui/textarea'
import { formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'

const QUICK_REASONS = ['Extra cleaning needed', 'Spill or mess', 'Late class or event', 'Delivery to unpack']

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: Session
  userId: string
  settings: SiteSettings
  onSent: (minutes: number) => void
}

export function ExtensionSheet({ open, onOpenChange, session, userId, settings, onSent }: Props) {
  const cap = Math.min(settings.max_extension_request_min, settings.max_shift_min - session.approvedMin)
  // Handy presets, always ending on the most that can still be asked for.
  const options = [...new Set([10, 15, 20, cap])].filter((m) => m > 0 && m <= cap)
  const [minutes, setMinutes] = useState<number | null>(options[0] ?? null)
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setMinutes(options[0] ?? null)
    setReason('')
    setError(null)
  }

  async function send() {
    if (!minutes || !reason.trim() || !session.shift) return
    setSending(true)
    setError(null)
    try {
      await requestExtension({ shiftId: session.shift.id, requestedBy: userId, minutes, reason })
      onSent(minutes)
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
      'min-h-12 rounded-xl border px-3 text-base font-medium transition-colors',
      active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background active:bg-muted',
    )

  return (
    <Drawer open={open} onOpenChange={(o) => (onOpenChange(o), !o && reset())}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">Ask for extra time</DrawerTitle>
          <DrawerDescription className="text-[15px]">Carly will see your request and reply here.</DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">How much more time?</legend>
            <div className="grid grid-cols-4 gap-2">
              {options.map((m) => (
                <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)} className={chip(minutes === m)}>
                  {m} min
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Up to {formatDuration(cap)} on this shift.</p>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Why?</legend>
            <div className="flex flex-wrap gap-2">
              {QUICK_REASONS.map((r) => (
                <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)} className={chip(reason === r)}>
                  {r}
                </button>
              ))}
            </div>
            <label htmlFor="ext-reason" className="sr-only">
              Reason
            </label>
            <Textarea
              id="ext-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Or write your own reason"
              className="mt-2 min-h-20 text-base"
            />
          </fieldset>
        </div>

        <DrawerFooter>
          <p aria-live="polite" className="text-center text-sm text-warn empty:hidden">
            {error}
          </p>
          <button
            type="button"
            onClick={send}
            disabled={!minutes || !reason.trim() || sending}
            className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press disabled:bg-muted disabled:text-muted-foreground"
          >
            {sending && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
            {minutes ? `Send · ${minutes} min` : 'Send'}
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
