// Carly's dashboard: what needs her first (requests, flags, supplies), then today and fortnight hours.
// Phone: one column. Wide screens: Needs you on the left, Today and Hours on the right.
import { useState, type ReactNode } from 'react'
import { CalendarX, ChevronRight, LogOut, MapPin, MapPinOff, Package, Timer, UserX } from 'lucide-react'
import { markNoteDone } from '@/data'
import type { FlagKind } from '@/types'
import { useManagerDashboard } from '@/hooks/useManagerDashboard'
import { Disc, Section } from '@/components/common/ListParts'
import { rowClass, smallButton } from '@/components/common/listStyles'
import { RequestList } from '@/components/requests/RequestList'
import { FlagSheet, type FlagView } from '@/components/manager/FlagSheet'
import { FLAG_LABEL } from '@/components/manager/flagText'
import { TodayPanel } from '@/components/manager/TodayPanel'
import { HoursPanel } from '@/components/manager/HoursPanel'
import { firstName, formatClock, formatDateLong, formatDateShort, localDay, siteShortName } from '@/lib/format'
import { localDate } from '@/lib/rules'

const FLAG_ICON: Record<FlagKind, ReactNode> = {
  off_site: <MapPin />,
  no_location: <MapPinOff />,
  unscheduled: <CalendarX />,
  no_show: <UserX />,
  missing_clock_out: <LogOut />,
  over_without_extension: <Timer />,
}

export function ManagerDashboard() {
  const { data, error, refresh } = useManagerDashboard()
  const [openFlag, setOpenFlag] = useState<FlagView | null>(null)
  const [doneErr, setDoneErr] = useState<string | null>(null)

  if (error && !data) {
    return (
      <main className="mx-auto max-w-[480px] px-4 pt-24 text-center">
        <p className="text-lg font-medium">We couldn't load the dashboard.</p>
        <button type="button" onClick={() => void refresh()} className={`${smallButton.outline} mt-4`}>
          Try again
        </button>
      </main>
    )
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-[480px] px-4 pt-16" role="status" aria-label="Loading">
        <div className="h-7 w-40 rounded-md bg-muted" />
        <div className="mt-6 h-40 rounded-[18px] bg-muted motion-safe:animate-pulse" />
      </main>
    )
  }

  const { me, settings, now, requests, flags, supplies, today, fortnights, currentFortnight } = data
  const tz = settings.timezone
  const total = requests.length + flags.length + supplies.length

  async function done(noteId: string) {
    setDoneErr(null)
    try {
      await markNoteDone({ noteId, doneBy: me.id })
      void refresh()
    } catch {
      setDoneErr('Not saved yet. Try again.')
    }
  }

  return (
    <main className="mx-auto min-h-svh max-w-[480px] px-4 pb-12 lg:max-w-6xl lg:px-10">
      <header className="flex h-12 items-center justify-between px-1">
        <p className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold tracking-[0.08em] uppercase">World Gym</span>
          <span className="text-[15px] text-muted-foreground">{siteShortName(settings.site_name)}</span>
        </p>
        <span aria-label={me.full_name} className="flex size-9 items-center justify-center rounded-full bg-muted text-[15px] font-semibold">
          {me.full_name[0]}
        </span>
      </header>

      <div className="px-1 pt-1">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.01em]">Hi {firstName(me.full_name)}</h1>
        <p className="mt-0.5 text-[15px] text-muted-foreground">
          {formatDateLong(localDate(now, settings))} · {total === 0 ? 'Nothing needs you right now' : `${total} ${total === 1 ? 'thing needs' : 'things need'} you`}
        </p>
      </div>

      {/* Phone: one column in reading order. Wide: requests and flags on the left; supplies, today
          and hours on the right, so every "needs you" section is in the first view. */}
      <div className="lg:mt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr] lg:gap-x-12">
        <div className="lg:row-span-2">
          <Section id="requests-title" title="Requests" count={requests.length} empty="No requests to decide.">
            <RequestList items={requests} viewer={me} tz={tz} now={now} onChanged={() => void refresh()} />
          </Section>

          <Section id="flags-title" title="Flags to check" count={flags.length} empty="No flags. Every clock-in looks fine.">
            <ul>
              {flags.map((v) => (
                <li key={v.flag.id}>
                  <button type="button" onClick={() => setOpenFlag(v)} className={`${rowClass} min-h-14 items-center active:bg-muted`}>
                    <Disc tone="warn">{FLAG_ICON[v.flag.kind]}</Disc>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base leading-snug font-medium">
                        {firstName(v.user.full_name)} · {FLAG_LABEL[v.flag.kind]}
                      </span>
                      <span className="block text-sm leading-snug text-muted-foreground">
                        {formatDateShort(localDay(v.flag.created_at, tz))}, {formatClock(v.flag.created_at, tz)} · {v.flag.detail}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className="lg:col-start-2 lg:row-start-1">
          <Section id="supplies-title" title="Supplies" count={supplies.length} empty="Nothing running low.">
            {doneErr && (
              <p role="alert" className="px-1 pt-2 text-sm text-warn">
                {doneErr}
              </p>
            )}
            <ul>
              {supplies.map(({ note, user }) => (
                <li key={note.id} className={`${rowClass} items-center`}>
                  <Disc tone="neutral">
                    <Package />
                  </Disc>
                  <div className="min-w-0 flex-1">
                    <p className="text-base leading-snug">{note.body}</p>
                    <p className="text-sm text-muted-foreground">
                      {user ? firstName(user.full_name) : 'Staff'} · {formatDateShort(localDay(note.created_at, tz))}
                    </p>
                  </div>
                  <button type="button" onClick={() => void done(note.id)} className={smallButton.outline}>
                    Done
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className="mt-8 lg:col-start-2 lg:row-start-2">
          <TodayPanel rows={today} settings={settings} now={now} />
          <HoursPanel fortnights={fortnights} current={currentFortnight} refreshedAt={now} />
        </div>
      </div>

      {openFlag && <FlagSheet key={openFlag.flag.id} view={openFlag} viewer={me} settings={settings} onOpenChange={(o) => !o && setOpenFlag(null)} onChanged={() => void refresh()} />}
    </main>
  )
}
