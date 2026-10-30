// Location and extra-time rows under the pass. Problems read as notes for Carly, never as blame.
import type { ReactNode } from 'react'
import { Check, ChevronRight, Hourglass, MapPin, MapPinOff, Plus } from 'lucide-react'
import type { EffectiveClockEvent } from '@/data'
import type { SiteSettings } from '@/types'
import type { HomePhase, LocationAccess, Session } from '@/hooks/useCleanerHome'
import { formatClock, formatDuration } from '@/lib/format'
import { isOffSite } from '@/lib/rules'
import { cn } from '@/lib/utils'

export type Tone = 'ok' | 'warn' | 'neutral'

const toneClass: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  neutral: 'bg-muted text-foreground',
}

export function StatusRow({ icon, tone, title, detail, onClick }: { icon: ReactNode; tone: Tone; title: string; detail: string; onClick?: () => void }) {
  const body = (
    <>
      <span aria-hidden className={cn('flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-[18px]', toneClass[tone])}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base leading-snug font-medium">{title}</span>
        <span className="block text-sm leading-snug text-muted-foreground">{detail}</span>
      </span>
      {onClick && <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />}
    </>
  )
  const layout = 'flex w-full items-center gap-3 border-b border-border px-1 py-3 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(layout, 'min-h-14 rounded-none transition-colors active:bg-muted')}>
      {body}
    </button>
  ) : (
    <div className={layout}>{body}</div>
  )
}

type LocationKind = 'ok' | 'away' | 'none'

function locationOf(e: EffectiveClockEvent, settings: SiteSettings): LocationKind {
  if (e.location_status !== 'ok') return 'none'
  return isOffSite(e.distance_m, e.accuracy_m, settings) ? 'away' : 'ok'
}

export function LocationRow({ phase, settings, access, onHelp }: { phase: HomePhase; settings: SiteSettings; access: LocationAccess; onHelp: () => void }) {
  const notClocked = phase.kind === 'before' || phase.kind === 'no_shift'
  // Warn before the next tap that needs a location, so it can be fixed instead of flagged.
  if (access === 'blocked' && (notClocked || phase.kind === 'on')) {
    const next = phase.kind === 'on' ? 'clock-out' : 'clock-in'
    return <StatusRow icon={<MapPinOff />} tone="warn" title="Location is blocked" detail={`Turn it on so Carly doesn't have to check your ${next}. Tap for how.`} onClick={onHelp} />
  }
  if (notClocked) {
    const detail = access === 'ask' ? 'Your phone will ask when you tap Clock in. Tap Allow.' : 'Checked only when you tap Clock in or Clock out.'
    return <StatusRow icon={<MapPin />} tone="neutral" title="Location" detail={detail} />
  }
  const { clockIn, clockOut } = phase.session
  const inKind = locationOf(clockIn, settings)
  const outKind = clockOut ? locationOf(clockOut, settings) : null
  const problem = [inKind, outKind].find((k) => k === 'away' || k === 'none')
  if (!problem) {
    return <StatusRow icon={<Check strokeWidth={3} />} tone="ok" title="At the gym" detail={clockOut ? 'Saved when you clocked in and out' : 'Saved when you clocked in'} />
  }
  const when = inKind !== 'ok' ? (outKind && outKind !== 'ok' ? 'you clocked in and out' : 'you clocked in') : 'you clocked out'
  return problem === 'none' ? (
    <StatusRow icon={<MapPinOff />} tone="warn" title="No location" detail={`We couldn't get your location when ${when}. Carly will check it.`} />
  ) : (
    <StatusRow icon={<MapPin />} tone="warn" title="Away from the gym" detail={`Your phone was outside the gym when ${when}. Carly will check it.`} />
  )
}

export function ExtensionRow({ session, settings, tz, onAsk }: { session: Session; settings: SiteSettings; tz: string; onAsk: () => void }) {
  const latest = session.extensions[0] // newest first
  const room = settings.max_shift_min - session.approvedMin
  const canAsk = session.shift !== null && !session.clockOut && latest?.status !== 'pending' && room > 0
  const ask = canAsk ? onAsk : undefined

  if (session.shift === null) return null
  if (latest?.status === 'pending') {
    return <StatusRow icon={<Hourglass />} tone="warn" title={`Extra ${formatDuration(latest.minutes)} asked`} detail="Waiting for Carly" />
  }
  if (latest?.status === 'approved') {
    const until = formatClock(new Date(Date.parse(session.clockIn.effective_time) + session.approvedMin * 60_000).toISOString(), tz)
    return (
      <StatusRow
        icon={<Check strokeWidth={3} />}
        tone="ok"
        title={`Extra ${formatDuration(latest.minutes)} approved`}
        detail={`You can stay until ${until}.`}
        onClick={ask}
      />
    )
  }
  if (session.clockOut) return null
  if (room <= 0) {
    return <StatusRow icon={<Plus />} tone="neutral" title="No more extra time" detail={`${formatDuration(settings.max_shift_min)} is the most a shift can be approved for.`} />
  }
  if (latest?.status === 'declined') {
    return <StatusRow icon={<Plus />} tone="neutral" title="Extra time not approved" detail="You can ask again if you need to." onClick={ask} />
  }
  return <StatusRow icon={<Plus />} tone="neutral" title="Need more time?" detail={`Ask Carly for up to ${formatDuration(Math.min(room, settings.max_extension_request_min))}.`} onClick={ask} />
}
