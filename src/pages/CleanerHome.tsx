// Cleaner home: today's shift as a pass, one docked clock button, location and extra time, next shifts.
// Clocking always saves; location problems and unscheduled clock-ins are flagged for Carly, never blocked.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, Clock, Hourglass, LoaderCircle, MessageSquare, Undo2, X } from 'lucide-react'
import { AlreadyClockedInError, clockIn, clockOut } from '@/data'
import type { ClockLocation, ClockResult } from '@/data'
import type { FlagKind, Photo, SiteSettings } from '@/types'
import { photoTargetOf, useCleanerHome, type CleanerHome as HomeData, type Session, type VoidNotice } from '@/hooks/useCleanerHome'
import { ShiftPass } from '@/components/home/ShiftPass'
import { ExtensionRow, LocationRow, StatusRow } from '@/components/home/StatusRows'
import { PhotosRow } from '@/components/home/PhotosRow'
import { PhotoSheet } from '@/components/home/PhotoSheet'
import { PhotoPrompt } from '@/components/home/PhotoPrompt'
import { NoteSheet, type NoteSent } from '@/components/home/NoteSheet'
import { usePhotoUploads } from '@/hooks/usePhotoUploads'
import { ShiftHandoffs } from '@/components/home/ShiftHandoffs'
import { ShiftNotesCard } from '@/components/home/ShiftNotesCard'
import { useShiftNotes } from '@/hooks/useShiftNotes'
import { TeamSwaps } from '@/components/home/TeamSwaps'
import { ExtensionSheet } from '@/components/home/ExtensionSheet'
import { ClockOutConfirm } from '@/components/home/ClockOutConfirm'
import { ClockInConfirm } from '@/components/home/ClockInConfirm'
import { AlreadyClockedInSheet } from '@/components/home/AlreadyClockedInSheet'
import { MistakeSheet } from '@/components/home/MistakeSheet'
import { FinishTimeSheet, type FinishMode } from '@/components/home/FinishTimeSheet'
import { LocationFailSheet } from '@/components/home/LocationFailSheet'
import { LocationHelpSheet } from '@/components/home/LocationHelpSheet'
import { AwayFromGymSheet } from '@/components/home/AwayFromGymSheet'
import { AccountButton } from '@/components/common/AccountButton'
import { RosterRow } from '@/components/roster/RosterRow'
import { RecordsRow } from '@/components/records/RecordsRow'
import { firstName, formatClock, formatDateLong, formatDateShort, formatDuration, formatTime, shiftLabel, siteShortName } from '@/lib/format'
import { getClockLocation } from '@/lib/geolocation'
import { compareTs, distanceMetres, isOffSite, isOverApproved, localDate, minutesBetween, needsClockInConfirm, shiftStartAt } from '@/lib/rules'
import { cn } from '@/lib/utils'

type Step = 'idle' | 'locating' | 'saving' | 'saved'
type Receipt = { tone: 'ok' | 'warn'; title: string; detail?: string; action?: { label: string; onClick: () => void } }
type NoFix = Extract<ClockLocation, { status: unknown }>
type Fix = Exclude<ClockLocation, NoFix>

/** Plain, warm wording for what just happened. Flags become "Carly will check it", never blame. */
function receiptFor(kind: 'in' | 'out', result: ClockResult, name: string, workedMin: number | null): Receipt {
  const kinds = new Set<FlagKind>(result.flags.map((f) => f.kind))
  const notes: string[] = []
  if (kinds.has('no_location')) notes.push("We couldn't get your location")
  if (kinds.has('off_site')) notes.push('Your phone was outside the gym')
  if (kinds.has('unscheduled')) notes.push("You're not on the roster today")
  if (kinds.has('over_without_extension')) notes.push('You worked past your approved time')
  if (kinds.has('off_start')) notes.push("It's a while from your shift's start")
  if (kinds.has('short_session')) notes.push('That was a very short session')
  const detail = notes.length ? `${notes.join('. ')}, so Carly will check it. Your time is saved.` : undefined
  const title =
    kind === 'in' ? `You're clocked in, ${name}.` : `Nice work, ${name}. You worked ${formatDuration(workedMin ?? 0)}.`
  return { tone: notes.length ? 'warn' : 'ok', title, detail: detail ?? (kind === 'in' ? 'Have a good shift.' : 'See you next shift.') }
}

export function CleanerHome({ onSignOut, onOpenRoster, onOpenRecords }: { onSignOut: () => void; onOpenRoster?: () => void; onOpenRecords: () => void }) {
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
  return <Home data={data} refresh={refresh} onSignOut={onSignOut} onOpenRoster={onOpenRoster} onOpenRecords={onOpenRecords} />
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-svh max-w-[480px] px-4">{children}</main>
}

function Home({
  data,
  refresh,
  onSignOut,
  onOpenRoster,
  onOpenRecords,
}: {
  data: HomeData
  refresh: () => Promise<void>
  onSignOut: () => void
  onOpenRoster?: () => void
  onOpenRecords: () => void
}) {
  const { user, settings, now, phase, upcoming, recordShift, photos, notes, voidNotice, autoClosed } = data
  const name = firstName(user.full_name)
  const tz = settings.timezone
  const session = phase.kind === 'on' || phase.kind === 'done' ? phase.session : null
  // Photos from clock-in on: on the rostered shift, or on the clock-in when working off the roster.
  const photoTarget = session ? photoTargetOf(session) : null

  const [step, setStep] = useState<Step>('idle')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [failed, setFailed] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [extOpen, setExtOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [noFix, setNoFix] = useState<{ kind: 'in' | 'out'; location: NoFix } | null>(null)
  const [away, setAway] = useState<{ location: Fix; distance: number } | null>(null)
  const [photoPromptOpen, setPhotoPromptOpen] = useState(false)
  const [openPhoto, setOpenPhoto] = useState<Photo | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [inConfirmOpen, setInConfirmOpen] = useState(false)
  const [alreadySince, setAlreadySince] = useState<string | null>(null)
  const [mistakeOpen, setMistakeOpen] = useState(false)
  const [finish, setFinish] = useState<{ mode: FinishMode; session: Session } | null>(null)
  const receiptTimer = useRef<number | undefined>(undefined)
  const refreshQuietly = useCallback(() => void refresh(), [refresh])
  const uploads = usePhotoUploads({
    target: photoTarget,
    userId: user.id,
    room: settings.max_photos_per_shift - photos.length,
    onSaved: refreshQuietly,
  })
  // Photos for a shift closed automatically: they can still add them once they've answered.
  const autoTarget = autoClosed ? photoTargetOf(autoClosed.session) : null
  const autoUploads = usePhotoUploads({
    target: autoTarget,
    userId: user.id,
    room: settings.max_photos_per_shift - (autoClosed?.photos.length ?? 0),
    onSaved: refreshQuietly,
  })

  useEffect(() => () => window.clearTimeout(receiptTimer.current), [])

  const showReceipt = (r: Receipt) => {
    setReceipt(r)
    window.clearTimeout(receiptTimer.current)
    receiptTimer.current = window.setTimeout(() => setReceipt(null), 12_000)
  }

  async function clock(kind: 'in' | 'out') {
    setConfirmOpen(false)
    setInConfirmOpen(false)
    setAlreadySince(null)
    setPhotoPromptOpen(false)
    setFailed(false)
    setReceipt(null)
    setNoFix(null)
    setAway(null)
    setStep('locating')
    const location = await getClockLocation()
    // No location: nothing is saved yet. Offer a retry first; "anyway" saves it and Carly checks it.
    if ('status' in location) {
      setStep('idle')
      setNoFix({ kind, location })
      return
    }
    // Clocking in from outside the gym: ask first, so someone still on the way can check again.
    const distance = distanceMetres(location.lat, location.lng, settings.gym_lat, settings.gym_lng)
    if (kind === 'in' && isOffSite(distance, location.accuracy_m, settings)) {
      setStep('idle')
      setAway({ location, distance })
      return
    }
    await save(kind, location)
  }

  async function save(kind: 'in' | 'out', location: ClockLocation) {
    setNoFix(null)
    setAway(null)
    setStep('saving')
    try {
      const result = kind === 'in' ? await clockIn(user.id, location) : await clockOut(user.id, location)
      const worked = kind === 'out' && session ? minutesBetween(session.clockIn.effective_time, result.event.server_time) : null
      await refresh()
      const r = receiptFor(kind, result, name, worked)
      // Clocked out with no photos: the receipt offers them, since clocking out never waits for photos.
      if (kind === 'out' && photoTarget && photos.length === 0 && uploads.queue.length === 0) {
        const closes = formatClock(new Date(Date.parse(result.event.server_time) + settings.photo_upload_window_min * 60_000).toISOString(), tz)
        r.detail = `${r.tone === 'warn' ? `${r.detail} ` : ''}Please add your work photos by ${closes}.`
        r.action = { label: 'Add photos', onClick: uploads.pick }
      }
      showReceipt(r)
      // The button itself confirms with one drawn tick before settling into its next state.
      setStep('saved')
      window.setTimeout(() => setStep('idle'), 1400)
      // Past the approved finish by more than the leeway: ask once what happened (stayed, or forgot to clock out).
      if (kind === 'out' && session && worked !== null && isOverApproved(worked, session.approvedMin, settings)) {
        const out = { ...result.event, effective_time: result.event.server_time, corrected: false, voided: null }
        setFinish({ mode: 'late', session: { ...session, clockOut: out, workedMin: worked } })
      }
    } catch (e) {
      setStep('idle')
      // Already clocked in (another phone, or a stale screen): nothing saved; offer to clock out.
      if (e instanceof AlreadyClockedInError) {
        setAlreadySince(e.since)
        void refresh()
      } else setFailed(true)
    }
  }

  const onPrimary = () => {
    if (phase.kind === 'on') {
      // Before the approved length a mistaken tap would end the shift early, so ask once.
      const early = phase.session.shift !== null && phase.session.workedMin < phase.session.approvedMin
      // No photos yet: ask "Add your photos first?" once (it also covers the early question). Never a block.
      if (photoTarget && photos.length === 0 && uploads.queue.length === 0) setPhotoPromptOpen(true)
      else if (early) setConfirmOpen(true)
      else void clock('out')
    } else if (needsClockInConfirm(phase.kind === 'before' ? shiftStartAt(phase.shift, settings) : null, now, settings)) {
      // No shift today, or far from its start: ask once. On time stays one tap.
      setInConfirmOpen(true)
    } else void clock('in')
  }

  const mistakeSent = () => {
    void refresh()
    showReceipt({ tone: 'ok', title: 'Sent to Carly.', detail: session?.clockOut ? 'She can remove the clock-in.' : "You're clocked out. Clock in again when you start." })
  }

  const finishSent = (message: { title: string; detail: string }) => {
    const answered = finish
    void refresh()
    const r: Receipt = { tone: 'ok', ...message }
    // An automatic close with no photos: they can add them now (the window counts from this answer).
    if (answered?.mode === 'auto' && autoTarget && autoClosed?.photos.length === 0) r.action = { label: 'Add photos', onClick: autoUploads.pick }
    showReceipt(r)
  }

  const noteSent = ({ tag, arriveBy }: NoteSent) => {
    void refresh()
    if (tag === 'running_late' && arriveBy) {
      showReceipt({ tone: 'ok', title: `Thanks, ${name}. Carly knows.`, detail: `She'll expect you about ${formatClock(arriveBy, tz)}. Your time starts when you clock in.` })
    } else {
      showReceipt({ tone: 'ok', title: 'Sent to Carly.', detail: tag === 'supplies_low' ? "She'll see what is running low." : 'She sees it on her dashboard.' })
    }
  }
  const lateNote = phase.kind === 'before' ? notes.find((n) => n.tag === 'running_late' && n.arrive_by) : undefined

  const busy = step === 'locating' || step === 'saving'
  const showDock = phase.kind !== 'done' || step === 'saved'
  const markTs = session ? new Date(Date.parse(session.clockIn.effective_time) + session.approvedMin * 60_000).toISOString() : null
  const next = upcoming[0]
  const todayShift = phase.kind === 'before' ? phase.shift : phase.kind === 'on' ? phase.session.shift : null
  const noteShifts = todayShift ? [todayShift, ...upcoming] : upcoming
  const shiftNotes = useShiftNotes(user.id, noteShifts, now)
  // Seen notes on later shifts sit on their Next shifts card; new ones and today's stay under the pass.
  const seenNotes = new Map<string, { id: string; from: string; body: string }[]>()
  for (const n of shiftNotes.notes) {
    if (n.seen_at === null || noteShifts.find((s) => s.id === n.shift_id)?.date === localDate(now, settings)) continue
    seenNotes.set(n.shift_id, [...(seenNotes.get(n.shift_id) ?? []), { id: n.id, from: shiftNotes.authorName(n), body: n.body }])
  }

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

      {/* Notes from Carly or their team lead, for today's shift (until clock-out) and the next ones. */}
      <ShiftNotesCard settings={settings} now={now} shifts={noteShifts} shiftNotes={shiftNotes} />

      <div className="mt-2">
        {autoClosed && autoClosed.session.clockOut && (
          <StatusRow
            icon={<CircleAlert />}
            tone="warn"
            title="You didn't clock out"
            detail={`We closed your ${autoClosed.session.shift ? `${formatDateShort(autoClosed.session.shift.date)} shift` : 'session'} at ${formatClock(autoClosed.session.clockOut.effective_time, tz)}. Is that right?`}
            onClick={() => setFinish({ mode: 'auto', session: autoClosed.session })}
          />
        )}
        {voidNotice && <VoidNoticeRow notice={voidNotice} tz={tz} />}
        <LocationRow phase={phase} settings={settings} access={data.locationAccess} onHelp={() => setHelpOpen(true)} />
        {photoTarget && session && (
          <PhotosRow
            photos={photos}
            queue={uploads.queue}
            notice={uploads.notice}
            settings={settings}
            now={now}
            clockOut={session.clockOut?.effective_time ?? null}
            onPick={uploads.pick}
            onRetry={uploads.retry}
            onOpen={setOpenPhoto}
          />
        )}
        {session && <ExtensionRow session={session} settings={settings} tz={tz} onAsk={() => setExtOpen(true)} />}
        {session && <FinishRow session={session} settings={settings} onAsk={() => setFinish({ mode: 'late', session })} />}
        {recordShift && (
          <StatusRow
            icon={<MessageSquare />}
            tone="neutral"
            title="Note for Carly"
            detail={
              lateNote?.arrive_by
                ? `Carly knows you'll arrive about ${formatClock(lateNote.arrive_by, tz)}.`
                : phase.kind === 'before'
                  ? 'Running late? Tell her here.'
                  : 'Supplies, a problem or anything else.'
            }
            onClick={() => setNoteOpen(true)}
          />
        )}
        {session && !session.voidRequest && (
          <button
            type="button"
            onClick={() => setMistakeOpen(true)}
            className="mt-1 flex min-h-12 w-full items-center gap-2 px-1 text-left text-[15px] text-muted-foreground transition-colors active:text-foreground"
          >
            <Undo2 aria-hidden className="size-4" />
            This clock-in was a mistake
          </button>
        )}
      </div>

      <ShiftHandoffs user={user} settings={settings} now={now} upcoming={upcoming} notes={seenNotes} onChanged={() => void refresh()} />

      {/* Team lead only: Gladys rosters for everyone on Carly's behalf. */}
      {/* A cleaner sees their own past shifts; Gladys sees her group's (src/data checks it). */}
      <RecordsRow own={user.role === 'cleaner'} onOpen={onOpenRecords} className="mt-6" />
      {onOpenRoster && <RosterRow onOpen={onOpenRoster} className="mt-3" />}

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

      {session && (
        <PhotoPrompt
          open={photoPromptOpen}
          onOpenChange={setPhotoPromptOpen}
          earlyNote={
            markTs && session.shift && session.workedMin < session.approvedMin
              ? `You've worked ${formatDuration(session.workedMin)}. Your shift time is up at ${formatClock(markTs, tz)}.`
              : null
          }
          uploadWindowMin={settings.photo_upload_window_min}
          onAddPhotos={() => {
            setPhotoPromptOpen(false)
            uploads.pick()
          }}
          onClockOut={() => void clock('out')}
        />
      )}
      {openPhoto && (
        <PhotoSheet
          key={openPhoto.id}
          photo={openPhoto}
          index={Math.max(0, photos.findIndex((p) => p.id === openPhoto.id))}
          total={photos.length}
          userId={user.id}
          settings={settings}
          now={now}
          onOpenChange={(o) => !o && setOpenPhoto(null)}
          onRemoved={refreshQuietly}
        />
      )}
      {recordShift && (
        <NoteSheet
          key={`${recordShift.id}-${phase.kind === 'before'}`}
          open={noteOpen}
          onOpenChange={setNoteOpen}
          shift={recordShift}
          beforeClockIn={phase.kind === 'before'}
          userId={user.id}
          settings={settings}
          now={now}
          onSent={noteSent}
        />
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
      {away && (
        <AwayFromGymSheet
          open
          onOpenChange={(o) => !o && setAway(null)}
          distanceM={away.distance}
          accuracyM={away.location.accuracy_m}
          onRetry={() => void clock('in')}
          onAnyway={() => void save('in', away.location)}
        />
      )}
      <LocationHelpSheet open={helpOpen} onOpenChange={setHelpOpen} onFixed={() => void refresh()} />
      <ClockInConfirm
        open={inConfirmOpen}
        onOpenChange={setInConfirmOpen}
        startLabel={phase.kind === 'before' ? formatTime(phase.shift.start_time) : null}
        onConfirm={() => void clock('in')}
      />
      {alreadySince && (
        <AlreadyClockedInSheet
          open
          onOpenChange={(o) => !o && setAlreadySince(null)}
          sinceLabel={formatClock(alreadySince, tz)}
          onClockOut={() => void clock('out')}
        />
      )}
      {session && (
        <MistakeSheet
          key={session.clockIn.id}
          open={mistakeOpen}
          onOpenChange={setMistakeOpen}
          clockIn={session.clockIn}
          stillOpen={!session.clockOut}
          userId={user.id}
          settings={settings}
          onSent={mistakeSent}
        />
      )}
      {finish && finish.session.clockOut && (
        <FinishTimeSheet
          key={`${finish.mode}-${finish.session.clockOut.id}`}
          open
          onOpenChange={(o) => !o && setFinish(null)}
          mode={finish.mode}
          session={finish.session}
          userId={user.id}
          settings={settings}
          onSent={finishSent}
        />
      )}
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

/** What became of today's "This was a mistake". */
function VoidNoticeRow({ notice, tz }: { notice: VoidNotice; tz: string }) {
  const at = formatClock(notice.clockInAt, tz)
  if (notice.request.status === 'pending') {
    return <StatusRow icon={<Hourglass />} tone="neutral" title="Sent to Carly" detail={`Your ${at} clock-in was a mistake. She'll check it.`} />
  }
  return notice.request.status === 'approved' ? (
    <StatusRow icon={<Check strokeWidth={3} />} tone="ok" title={`Carly removed your ${at} clock-in`} detail="It doesn't count as worked time." />
  ) : (
    <StatusRow icon={<Undo2 />} tone="neutral" title={`Carly kept your ${at} clock-in`} detail="It counts as worked time. Ask her if that's wrong." />
  )
}

/** After clocking out past the approved finish: tell Carly what happened, then what she decided. */
function FinishRow({ session, settings, onAsk }: { session: Session; settings: SiteSettings; onAsk: () => void }) {
  const tz = settings.timezone
  const out = session.clockOut
  if (!out) return null
  const request = session.endRequest
  if (request?.status === 'pending') {
    const said = request.reason_code === 'confirm_auto_close' ? 'You confirmed' : 'You said you finished at'
    return <StatusRow icon={<Hourglass />} tone="neutral" title="Sent to Carly" detail={`${said} ${formatClock(request.requested_time ?? out.effective_time, tz)}.`} />
  }
  if (request?.status === 'approved') {
    return <StatusRow icon={<Check strokeWidth={3} />} tone="ok" title="Carly approved your finish time" detail={`Your shift ends at ${formatClock(out.effective_time, tz)}.`} />
  }
  if (request?.status === 'declined') {
    return <StatusRow icon={<Clock />} tone="neutral" title="Carly kept your clock-out time" detail={`Your shift ends at ${formatClock(out.effective_time, tz)}.`} />
  }
  // Asked for the extra time after clocking out: the extra-time row shows that.
  const askedAfter = session.extensions.some((e) => compareTs(e.created_at, out.server_time) >= 0)
  if (out.source !== 'phone' || !isOverApproved(session.workedMin, session.approvedMin, settings) || askedAfter) return null
  return (
    <StatusRow
      icon={<Clock />}
      tone="warn"
      title={`You clocked out ${formatDuration(session.workedMin - session.approvedMin)} late`}
      detail="Tell Carly what happened."
      onClick={onAsk}
    />
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
        {receipt.action && (
          <button
            type="button"
            onClick={receipt.action.onClick}
            className="mt-2.5 inline-flex h-11 items-center gap-2 rounded-[14px] bg-foreground px-4 text-[15px] font-semibold text-background transition-colors hover:bg-foreground/85 active:bg-foreground/85"
          >
            {receipt.action.label}
          </button>
        )}
      </div>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="-m-2 flex size-10 shrink-0 items-center justify-center rounded-full">
        <X aria-hidden className="size-5" />
      </button>
    </div>
  )
}
