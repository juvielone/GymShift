// Cleaner home: today's shift as a pass, one docked clock button, location and extra time, next shifts.
// Clocking always saves; location problems and unscheduled clock-ins are flagged for Carly, never blocked.
import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import { clockIn, clockOut } from '@/data'
import type { ClockLocation, ClockResult } from '@/data'
import type { FlagKind } from '@/types'
import { useCleanerHome, type CleanerHome as HomeData } from '@/hooks/useCleanerHome'
import { ShiftPass } from '@/components/home/ShiftPass'
import { ExtensionRow, LocationRow } from '@/components/home/StatusRows'
import { UpcomingShifts } from '@/components/home/UpcomingShifts'
import { TeamSwaps } from '@/components/home/TeamSwaps'
import { ExtensionSheet } from '@/components/home/ExtensionSheet'
import { ClockOutConfirm } from '@/components/home/ClockOutConfirm'
import { LocationFailSheet } from '@/components/home/LocationFailSheet'
import { LocationHelpSheet } from '@/components/home/LocationHelpSheet'
import { AccountButton } from '@/components/common/AccountButton'
import { RosterRow } from '@/components/roster/RosterRow'
import { firstName, formatClock, formatDateLong, formatDuration, shiftLabel, siteShortName } from '@/lib/format'
import { getClockLocation } from '@/lib/geolocation'
import { localDate, minutesBetween } from '@/lib/rules'
import { cn } from '@/lib/utils'

type Step = 'idle' | 'locating' | 'saving' | 'saved'
type Receipt = { tone: 'ok' | 'warn'; title: string; detail?: string }
type NoFix = Extract<ClockLocation, { status: unknown }>

/** Plain, warm wording for what just happened. Flags become "Carly will check it", never blame. */
function receiptFor(kind: 'in' | 'out', result: ClockResult, name: string, workedMin: number | null): Receipt {
  const kinds = new Set<FlagKind>(result.flags.map((f) => f.kind))
  const notes: string[] = []
  if (kinds.has('no_location')) notes.push("We couldn't get your location")
  if (kinds.has('off_site')) notes.push('Your phone was outside the gym')
  if (kinds.has('unscheduled')) notes.push("You're not on the roster today")
  if (kinds.has('over_without_extension')) notes.push('You worked past your approved time')
  const detail = notes.length ? `${notes.join('. ')}, so Carly will check it. Your time is saved.` : undefined
  const title =
    kind === 'in' ? `You're clocked in, ${name}.` : `Nice work, ${name}. You worked ${formatDuration(workedMin ?? 0)}.`
  return { tone: notes.length ? 'warn' : 'ok', title, detail: detail ?? (kind === 'in' ? 'Have a good shift.' : 'See you next shift.') }
}

export function CleanerHome({ onSignOut, onOpenRoster }: { onSignOut: () => void; onOpenRoster?: () => void }) {
  const { data, error, refresh } = useCleanerHome()

  if (error && !data) {
    return (
      <Shell>
        <div className="mt-24 text-center">
          <p className="text-lg font-medium">We couldn't load your shifts.</p>
          <button type="button" onClick={() => void refresh()} className="mt-4 h-12 rounded-[14px] border border-border px-6 font-medium">
            Try again
          </button>
        </div>
      </Shell>
    )
  }
  if (!data) {
    return (
      <Shell>
        <div aria-busy className="mt-16 space-y-4" role="status" aria-label="Loading">
          <div className="h-7 w-32 rounded-md bg-muted" />
          <div className="h-56 rounded-[18px] bg-muted motion-safe:animate-pulse" />
        </div>
      </Shell>
    )
  }
  return <Home data={data} refresh={refresh} onSignOut={onSignOut} onOpenRoster={onOpenRoster} />
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-svh max-w-[480px] px-4">{children}</main>
}

function Home({ data, refresh, onSignOut, onOpenRoster }: { data: HomeData; refresh: () => Promise<void>; onSignOut: () => void; onOpenRoster?: () => void }) {
  const { user, settings, now, phase, upcoming } = data
  const name = firstName(user.full_name)
  const tz = settings.timezone
  const session = phase.kind === 'on' || phase.kind === 'done' ? phase.session : null

  const [step, setStep] = useState<Step>('idle')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [failed, setFailed] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [extOpen, setExtOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [noFix, setNoFix] = useState<{ kind: 'in' | 'out'; location: NoFix } | null>(null)
  const receiptTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(receiptTimer.current), [])

  const showReceipt = (r: Receipt) => {
    setReceipt(r)
    window.clearTimeout(receiptTimer.current)
    receiptTimer.current = window.setTimeout(() => setReceipt(null), 12_000)
  }

  async function clock(kind: 'in' | 'out') {
    setConfirmOpen(false)
    setFailed(false)
    setReceipt(null)
    setNoFix(null)
    setStep('locating')
    const location = await getClockLocation()
    // No location: nothing is saved yet. Offer a retry first; "anyway" saves it and Carly checks it.
    if ('status' in location) {
      setStep('idle')
      setNoFix({ kind, location })
      return
    }
    await save(kind, location)
  }

  async function save(kind: 'in' | 'out', location: ClockLocation) {
    setNoFix(null)
    setStep('saving')
    try {
      const result = kind === 'in' ? await clockIn(user.id, location) : await clockOut(user.id, location)
      const worked = kind === 'out' && session ? minutesBetween(session.clockIn.effective_time, result.event.server_time) : null
      await refresh()
      showReceipt(receiptFor(kind, result, name, worked))
      // The button itself confirms with one drawn tick before settling into its next state.
      setStep('saved')
      window.setTimeout(() => setStep('idle'), 1400)
    } catch {
      setFailed(true)
      setStep('idle')
    }
  }

  const onPrimary = () => {
    if (phase.kind === 'on') {
      // Before the approved length a mistaken tap would end the shift early, so ask once.
      const early = phase.session.shift !== null && phase.session.workedMin < phase.session.approvedMin
      if (early) setConfirmOpen(true)
      else void clock('out')
    } else void clock('in')
  }

  const busy = step === 'locating' || step === 'saving'
  const showDock = phase.kind !== 'done' || step === 'saved'
  const markTs = session ? new Date(Date.parse(session.clockIn.effective_time) + session.approvedMin * 60_000).toISOString() : null
  const next = upcoming[0]

  return (
    <main className={cn('mx-auto min-h-svh max-w-[480px] px-4', !showDock ? 'pb-10' : phase.kind === 'no_shift' ? 'pb-[calc(env(safe-area-inset-bottom)+160px)]' : 'pb-[calc(env(safe-area-inset-bottom)+112px)]')}>
      <header className="flex h-12 items-center justify-between px-1">
        {/* Text wordmark until the official World Gym logo arrives; the site sits beside it like a pass's issuer line. */}
        <p className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold tracking-[0.08em] uppercase">World Gym</span>
          <span className="text-[15px] text-muted-foreground">{siteShortName(settings.site_name)}</span>
        </p>
        <AccountButton userId={user.id} name={user.full_name} siteName={settings.site_name} onSignOut={onSignOut} />
      </header>

      <div className="px-1 pt-1">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.01em]">Hi {name}</h1>
        <p className="mt-0.5 text-[15px] text-muted-foreground">{formatDateLong(localDate(now, settings))}</p>
      </div>

      <div aria-live="polite" className="empty:hidden">
        {receipt && <ReceiptBanner receipt={receipt} onClose={() => setReceipt(null)} />}
      </div>

      <div className="mt-4">
        <ShiftPass phase={phase} settings={settings} now={now} nextShiftLabel={next ? shiftLabel(next.date, next.start_time) : null} />
      </div>

      <div className="mt-2">
        <LocationRow phase={phase} settings={settings} access={data.locationAccess} onHelp={() => setHelpOpen(true)} />
        {session && <ExtensionRow session={session} settings={settings} tz={tz} onAsk={() => setExtOpen(true)} />}
      </div>

      <UpcomingShifts shifts={upcoming} />

      {/* Team lead only: Gladys rosters for everyone on Carly's behalf. */}
      {onOpenRoster && <RosterRow onOpen={onOpenRoster} className="mt-6" />}

      <TeamSwaps user={user} settings={settings} now={now} />

      {showDock && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pt-3">
          <div className="mx-auto max-w-[480px] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
            {failed && (
              <p role="alert" className="mb-2 rounded-xl bg-warn-soft px-3 py-2.5 text-center text-[15px] font-medium text-warn">
                Not saved yet. Check your internet and try again.
              </p>
            )}
            {phase.kind === 'no_shift' && !failed && (
              <p className="mb-2 text-center text-sm text-muted-foreground">You're not on the roster today. If you clock in, Carly will check it.</p>
            )}
            <button
              type="button"
              onClick={onPrimary}
              disabled={step !== 'idle'}
              aria-busy={busy}
              className={cn(
                'flex h-[58px] w-full items-center justify-center gap-2 rounded-[14px] text-lg font-semibold transition-[background-color,transform] duration-150 active:scale-[0.99] aria-busy:cursor-progress',
                phase.kind === 'no_shift'
                  ? 'border-2 border-foreground bg-background text-foreground active:bg-muted'
                  : 'bg-brand text-brand-foreground active:bg-brand-press disabled:bg-brand-press',
              )}
            >
              {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
              {step === 'saved' && (
                <svg aria-hidden viewBox="0 0 24 24" className="tick-draw size-6">
                  <path d="M6 12.5l4 4L18 8" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {step === 'locating' ? 'Checking your location…' : step === 'saving' ? 'Saving…' : step === 'saved' ? 'Saved' : phase.kind === 'on' ? 'Clock out' : 'Clock in'}
            </button>
          </div>
        </div>
      )}

      {session && markTs && (
        <ClockOutConfirm
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          workedLabel={formatDuration(session.workedMin)}
          markLabel={formatClock(markTs, tz)}
          onConfirm={() => void clock('out')}
        />
      )}
      {noFix && (
        <LocationFailSheet
          open
          onOpenChange={(o) => !o && setNoFix(null)}
          kind={noFix.kind}
          status={noFix.location.status}
          onRetry={() => void clock(noFix.kind)}
          onAnyway={() => void save(noFix.kind, noFix.location)}
          onHelp={() => {
            setNoFix(null)
            setHelpOpen(true)
          }}
        />
      )}
      <LocationHelpSheet open={helpOpen} onOpenChange={setHelpOpen} onFixed={() => void refresh()} />
      {session && session.shift && (
        <ExtensionSheet
          open={extOpen}
          onOpenChange={setExtOpen}
          session={session}
          userId={user.id}
          settings={settings}
          onSent={(m) => {
            void refresh()
            showReceipt({ tone: 'ok', title: `Asked for ${m} more minutes.`, detail: 'Carly will reply here.' })
          }}
        />
      )}
    </main>
  )
}

function ReceiptBanner({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  return (
    <div
      className={cn(
        'mt-4 flex items-start gap-3 rounded-2xl px-4 py-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2 motion-safe:duration-300',
        receipt.tone === 'ok' ? 'bg-ok-soft' : 'bg-warn-soft',
      )}
    >
      <svg aria-hidden viewBox="0 0 24 24" className={cn('tick-draw mt-0.5 size-6 shrink-0', receipt.tone === 'ok' ? 'text-ok' : 'text-warn')}>
        <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.15" />
        <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-base leading-snug font-semibold">{receipt.title}</p>
        {receipt.detail && <p className="mt-0.5 text-[15px] leading-snug text-foreground/80">{receipt.detail}</p>}
      </div>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="-m-2 flex size-10 shrink-0 items-center justify-center rounded-full">
        <X aria-hidden className="size-5" />
      </button>
    </div>
  )
}
