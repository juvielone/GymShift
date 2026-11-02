// "This was a mistake": tap the link, pick what happened, send. Three taps. Carly decides; until then the
// clock-in stays on record. A clock-in still open is clocked out first (location as for any clock-out), so
// they can clock in properly straight away.
import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { requestVoid } from '@/data'
import type { EffectiveClockEvent } from '@/data'
import type { CorrectionReason, SiteSettings } from '@/types'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Textarea } from '@/components/ui/textarea'
import { formatClock } from '@/lib/format'
import { getClockLocation } from '@/lib/geolocation'
import { cn } from '@/lib/utils'

const REASONS: { code: CorrectionReason; label: string }[] = [
  { code: 'accidental_tap', label: 'I tapped it by accident' },
  { code: 'wrong_time', label: 'Wrong time' },
  { code: 'other', label: 'Something else' },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  clockIn: EffectiveClockEvent
  /** Still clocked in: sending also clocks out. */
  stillOpen: boolean
  userId: string
  settings: SiteSettings
  onSent: () => void
}

export function MistakeSheet({ open, onOpenChange, clockIn, stillOpen, userId, settings, onSent }: Props) {
  const [reason, setReason] = useState<CorrectionReason | null>(null)
  const [note, setNote] = useState('')
  const [step, setStep] = useState<'idle' | 'locating' | 'sending'>('idle')
  const [error, setError] = useState<string | null>(null)
  const ready = reason !== null && (reason !== 'other' || note.trim() !== '')

  const reset = () => {
    setReason(null)
    setNote('')
    setError(null)
  }

  async function send() {
    if (!ready || !reason) return
    setError(null)
    try {
      setStep('locating')
      const location = stillOpen ? await getClockLocation() : undefined
      setStep('sending')
      await requestVoid({ clockEventId: clockIn.id, userId, reasonCode: reason, note: note.trim() || undefined, location })
      onSent()
      onOpenChange(false)
      reset()
    } catch (e) {
      setError(e instanceof Error && e.message.startsWith('Carly') ? e.message : 'Not sent yet. Check your internet and try again.')
    } finally {
      setStep('idle')
    }
  }

  const chip = (active: boolean) =>
    cn(
      'min-h-12 rounded-xl border px-3 text-left text-base font-medium transition-colors',
      active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background active:bg-muted',
    )

  return (
    <Drawer open={open} onOpenChange={(o) => (onOpenChange(o), !o && reset())}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">Clock-in at {formatClock(clockIn.effective_time, settings.timezone)} was a mistake?</DrawerTitle>
          <DrawerDescription className="text-[15px]">
            Carly will check it and can remove it.{stillOpen ? ' Sending this also clocks you out, so you can clock in again when you start.' : ''}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-3 overflow-y-auto px-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">What happened?</legend>
            <div className="grid gap-2">
              {REASONS.map((r) => (
                <button key={r.code} type="button" aria-pressed={reason === r.code} onClick={() => setReason(r.code)} className={chip(reason === r.code)}>
                  {r.label}
                </button>
              ))}
            </div>
          </fieldset>
          {reason === 'other' && (
            <>
              <label htmlFor="mistake-note" className="sr-only">
                What happened
              </label>
              <Textarea id="mistake-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tell Carly what happened" className="min-h-20 text-base" />
            </>
          )}
        </div>

        <DrawerFooter>
          <p aria-live="polite" className="text-center text-sm text-warn empty:hidden">
            {error}
          </p>
          <button
            type="button"
            onClick={send}
            disabled={!ready || step !== 'idle'}
            className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press disabled:bg-muted disabled:text-muted-foreground"
          >
            {step !== 'idle' && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
            {step === 'locating' ? 'Checking your location…' : step === 'sending' ? 'Sending…' : 'Send to Carly'}
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
