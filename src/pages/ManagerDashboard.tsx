// Carly's dashboard: who is on today (black pass), then one filterable list of what needs her,
// grouped by day with today's items first. Fortnight hours fold into one row that opens a sheet.
// Phone: one column. Wide screens: chips + list on the left, Today pass + hours row on the right.
import { useRef, useState } from 'react'
import { ChevronRight, CircleAlert, MapPin, Package, Users } from 'lucide-react'
import { getShiftRecord, markNoteDone, type ShiftRecord } from '@/data'
import type { Note, Timestamp, User } from '@/types'
import { useManagerDashboard } from '@/hooks/useManagerDashboard'
import { requestCreated } from '@/hooks/requests'
import { AccountButton } from '@/components/common/AccountButton'
import { Disc } from '@/components/common/ListParts'
import { rowClass, smallButton } from '@/components/common/listStyles'
import { RequestList } from '@/components/requests/RequestList'
import { FlagSheet, type FlagView } from '@/components/manager/FlagSheet'
import { FLAG_LABEL } from '@/components/manager/flagText'
import { FLAG_ICON } from '@/components/manager/flagIcons'
import { TodayPanel } from '@/components/manager/TodayPanel'
import { HoursSheet } from '@/components/manager/HoursSheet'
import { GymLocationSheet } from '@/components/manager/GymLocationSheet'
import { RosterRow } from '@/components/roster/RosterRow'
import { RecordsRow } from '@/components/records/RecordsRow'
import { ShiftRecordSheet } from '@/components/records/ShiftRecordSheet'
import { firstName, formatClock, formatDateLong, formatDateShort, formatDuration, localDay, siteShortName } from '@/lib/format'
import { addDays, localDate } from '@/lib/rules'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'requests' | 'corrections' | 'flags' | 'notes'
type NoteItem = { note: Note; user: User | null }

export function ManagerDashboard({
  onSignOut,
  onOpenRoster,
  onOpenStaff,
  onOpenRecords,
}: {
  onSignOut: () => void
  onOpenRoster?: () => void
  onOpenStaff?: () => void
  onOpenRecords: () => void
}) {
  const { data, error, refresh } = useManagerDashboard()
  const [filter, setFilter] = useState<Filter>('all')
  const [openFlag, setOpenFlag] = useState<FlagView | null>(null)
  const [hoursOpen, setHoursOpen] = useState(false)
  const [gymOpen, setGymOpen] = useState(false)
  const [doneErr, setDoneErr] = useState<string | null>(null)
  const [openRecord, setOpenRecord] = useState<ShiftRecord | null>(null)
  const listRef = useRef<HTMLElement>(null)

  // Switching filter while the chips are pinned returns to the top of the list, so a short
  // result never leaves Carly looking at empty space or jumps the page under her thumb.
  function selectFilter(f: Filter) {
    const section = listRef.current
    const top = section ? section.getBoundingClientRect().top + window.scrollY : 0
    setFilter(f)
    if (section && window.scrollY > top) requestAnimationFrame(() => window.scrollTo({ top }))
  }

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
        <div className="mt-6 h-32 rounded-[18px] bg-muted motion-safe:animate-pulse" />
      </main>
    )
  }

  const { me, settings, now, flags, notes, today, fortnights, currentFortnight, fortnightMin } = data
  const tz = settings.timezone
  // Pending corrections ("This was a mistake", "When did you finish?") get their own chip.
  const requests = data.requests.filter((r) => r.kind !== 'correction')
  const corrections = data.requests.filter((r) => r.kind === 'correction')
  const total = data.requests.length + flags.length + notes.length
  const todayDate = localDate(now, settings)

  async function openShift(shiftId: string) {
    setOpenRecord(await getShiftRecord({ shiftId, viewerId: me.id }))
  }

  async function done(noteId: string) {
    setDoneErr(null)
    try {
      await markNoteDone({ noteId, doneBy: me.id })
      void refresh()
    } catch {
      setDoneErr('Not saved yet. Try again.')
    }
  }

  // One list, split by day, newest day first ("Today", then "Tue 27 Oct", "Mon 26 Oct", ...).
  const show = (f: Filter) => filter === 'all' || filter === f
  const dayOf = (ts: Timestamp) => localDay(ts, tz)
  const shownReq = [...(show('requests') ? requests : []), ...(show('corrections') ? corrections : [])]
  const shownFlags = show('flags') ? flags : []
  const shownNotes = show('notes') ? notes : []
  const days = [...new Set([...shownReq.map((r) => dayOf(requestCreated(r))), ...shownFlags.map((v) => dayOf(v.flag.created_at)), ...shownNotes.map((s) => dayOf(s.note.created_at))])]
    .sort()
    .reverse()
  const groups = days.map((day) => ({
    id: day,
    label: day === todayDate ? 'Today' : formatDateShort(day),
    requests: shownReq.filter((r) => dayOf(requestCreated(r)) === day),
    flags: shownFlags.filter((v) => dayOf(v.flag.created_at) === day),
    notes: shownNotes.filter((s) => dayOf(s.note.created_at) === day),
  }))
  const shownCount = groups.reduce((n, g) => n + g.requests.length + g.flags.length + g.notes.length, 0)
  const emptyText: Record<Filter, string> = {
    all: 'Nothing needs you right now.',
    requests: 'No requests to decide.',
    corrections: 'No corrections to check.',
    flags: 'No flags. Every clock-in looks fine.',
    notes: 'No notes waiting. Nothing running low.',
  }

  const chips: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: total },
    { id: 'requests', label: 'Requests', count: requests.length },
    { id: 'corrections', label: 'Corrections', count: corrections.length },
    { id: 'flags', label: 'Flags', count: flags.length },
    { id: 'notes', label: 'Notes', count: notes.length },
  ]

  const hoursRow = (
    <button type="button" onClick={() => setHoursOpen(true)} className="mt-3 flex min-h-14 w-full items-center justify-between gap-3 rounded-[14px] border border-border px-4 py-3 text-left hover:bg-muted/60 active:bg-muted">
      <span>
        <span className="block text-base font-semibold">Fortnight hours · {formatDuration(fortnightMin)}</span>
        <span className="block text-sm text-muted-foreground">
          {formatDateShort(currentFortnight)} – {formatDateShort(addDays(currentFortnight, 13))} · per person and Export CSV
        </span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </button>
  )

  return (
    <main className="mx-auto min-h-svh max-w-[480px] px-4 pb-12 lg:max-w-6xl lg:px-10">
      <header className="flex h-12 items-center justify-between px-1">
        <p className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold tracking-[0.08em] uppercase">World Gym</span>
          <span className="text-[15px] text-muted-foreground">{siteShortName(settings.site_name)}</span>
        </p>
        <AccountButton
          userId={me.id}
          name={me.full_name}
          siteName={settings.site_name}
          onSignOut={onSignOut}
          manage={[
            ...(onOpenStaff ? [{ id: 'staff', icon: <Users />, title: 'Staff', detail: 'Add people and set their roles', onSelect: onOpenStaff }] : []),
            {
              id: 'gym-location',
              icon: <MapPin />,
              title: `Gym location · ${settings.radius_m} m radius`,
              detail: settings.updated_at ? `Set ${formatDateShort(localDay(settings.updated_at, tz))}` : 'Not set in the app yet',
              onSelect: () => setGymOpen(true),
            },
          ]}
        />
      </header>

      <div className="px-1 pt-1">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.01em]">Hi {firstName(me.full_name)}</h1>
        <p className="mt-0.5 text-[15px] text-muted-foreground">
          {formatDateLong(todayDate)} · {total === 0 ? 'Nothing needs you right now' : `${total} ${total === 1 ? 'thing needs' : 'things need'} you`}
        </p>
      </div>

      <div className="lg:mt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-12">
        {/* Who is on today, then hours. Phone: above the list. Wide: right column. */}
        <aside className="mt-4 lg:col-start-2 lg:row-start-1 lg:mt-4">
          <TodayPanel rows={today} settings={settings} now={now} onOpen={(id) => void openShift(id)} />
          {onOpenRoster && <RosterRow onOpen={onOpenRoster} className="mt-3" />}
          <RecordsRow own={false} onOpen={onOpenRecords} className="mt-3" />
          <div className="hidden lg:block">{hoursRow}</div>
        </aside>

        <section ref={listRef} aria-labelledby="needs-title" className="min-h-svh lg:col-start-1 lg:row-start-1 lg:min-h-0">
          <h2 id="needs-title" className="sr-only">
            Needs you
          </h2>
          {/* Filter chips stay in reach while the list scrolls. */}
          <div role="toolbar" aria-label="Filter" className="sticky top-0 z-20 -mx-4 flex gap-1.5 overflow-x-auto border-b border-border bg-background px-4 pt-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:px-0">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={filter === c.id}
                onClick={() => selectFilter(c.id)}
                className={cn(
                  'flex h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-[15px] font-medium whitespace-nowrap transition-colors',
                  filter === c.id ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:bg-muted active:bg-muted',
                )}
              >
                {c.label} <span className="font-semibold">{c.count}</span>
              </button>
            ))}
          </div>

          {doneErr && (
            <p role="alert" className="px-1 pt-2 text-sm text-warn">
              {doneErr}
            </p>
          )}

          {shownCount === 0 ? (
            <p className="border-b border-border px-1 py-3 text-[15px] text-muted-foreground">{emptyText[filter]}</p>
          ) : (
            groups.map((g) =>
              g.requests.length + g.flags.length + g.notes.length === 0 ? null : (
                <div key={g.id} role="group" aria-labelledby={`day-${g.id}`}>
                  <h3 id={`day-${g.id}`} className="px-1 pt-4 pb-0.5 text-[13px] font-medium text-muted-foreground">
                    {g.label}
                  </h3>
                  {g.requests.length > 0 && <RequestList items={g.requests} viewer={me} tz={tz} now={now} onChanged={() => void refresh()} />}
                  <ul>
                    {g.flags.map((v) => (
                      <li key={v.flag.id}>
                        <button type="button" onClick={() => setOpenFlag(v)} className={`${rowClass} min-h-14 items-center hover:bg-muted/60 active:bg-muted`}>
                          <Disc tone="warn">{FLAG_ICON[v.flag.kind]}</Disc>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base leading-snug font-medium">
                              {firstName(v.user.full_name)} · {FLAG_LABEL[v.flag.kind]}
                            </span>
                            <span className="line-clamp-1 text-sm leading-snug text-muted-foreground lg:line-clamp-none">
                              {formatClock(v.flag.created_at, tz)} · {v.flag.detail}
                            </span>
                          </span>
                          <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                    {g.notes.map((s: NoteItem) => (
                      <li key={s.note.id} className={`${rowClass} items-center`}>
                        <Disc tone="neutral">{s.note.tag === 'issue' ? <CircleAlert /> : <Package />}</Disc>
                        <div className="min-w-0 flex-1">
                          <p className="text-base leading-snug">{s.note.body}</p>
                          <p className="text-sm text-muted-foreground">
                            {s.user ? firstName(s.user.full_name) : 'Staff'} · {s.note.tag === 'issue' ? 'something wrong' : 'supplies'} · {formatClock(s.note.created_at, tz)}
                          </p>
                        </div>
                        <button type="button" onClick={() => void done(s.note.id)} className={smallButton.outline}>
                          Done
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )
          )}

          <div className="lg:hidden">{hoursRow}</div>
        </section>
      </div>

      {/* Mounted only while open, so each visit starts from the saved point. */}
      {gymOpen && <GymLocationSheet open onOpenChange={setGymOpen} settings={settings} me={me} onSaved={() => void refresh()} />}
      <HoursSheet open={hoursOpen} onOpenChange={setHoursOpen} fortnights={fortnights} current={currentFortnight} refreshedAt={now} />
      {openRecord && (
        <ShiftRecordSheet
          key={openRecord.shift.id}
          record={openRecord}
          settings={settings}
          now={now}
          onOpenChange={(o) => !o && setOpenRecord(null)}
          fixer={me}
          onChanged={() => void refresh()}
        />
      )}
      {openFlag && <FlagSheet key={openFlag.flag.id} view={openFlag} viewer={me} settings={settings} onOpenChange={(o) => !o && setOpenFlag(null)} onChanged={() => void refresh()} />}
    </main>
  )
}
