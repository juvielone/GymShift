// Past shifts, one fortnight (the roster and pay period) at a time, newest day first: who, times,
// worked, a strip of photos and anything to look at. Carly sees everyone and Gladys her group
// ("Shift records", with a person picker); a cleaner sees their own ("My past shifts").
// Pinned on top: the person picker, ‹ fortnight › arrows like the Hours sheet, and one summary line.
// Both choices open the app's own picker sheet, never the browser's dropdown.
// Tap a shift for its full record.
import { useState } from 'react'
import { Camera, ChevronDown, ChevronLeft, ChevronRight, MessageSquare, Moon, Sunrise, Users } from 'lucide-react'
import type { ShiftRecord } from '@/data'
import { useShiftRecords } from '@/hooks/useShiftRecords'
import { Disc } from '@/components/common/ListParts'
import { PhotoThumb } from '@/components/home/PhotosRow'
import { FLAG_LABEL } from '@/components/manager/flagText'
import { ShiftRecordSheet } from '@/components/records/ShiftRecordSheet'
import { PickerSheet } from '@/components/common/PickerSheet'
import { shortName, formatClock, formatDateShort, formatDuration } from '@/lib/format'
import { addDays } from '@/lib/rules'
import { cn } from '@/lib/utils'

const STRIP = 4
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "12 – 25 Oct", or "28 Sep – 11 Oct" across months. */
function rangeLabel(start: string): string {
  const fmt = (d: string, month: boolean) =>
    new Intl.DateTimeFormat('en-AU', { day: 'numeric', ...(month ? { month: 'short' } : {}), timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
  const end = addDays(start, 13)
  return `${fmt(start, start.slice(5, 7) !== end.slice(5, 7))} – ${fmt(end, true)}`
}

export function RecordsPage({ onBack }: { onBack: () => void }) {
  const [person, setPerson] = useState<string | null>(null)
  const [open, setOpen] = useState<ShiftRecord | null>(null)
  const [picking, setPicking] = useState<'person' | 'fortnight' | null>(null)
  const [showVoided, setShowVoided] = useState(false)
  const { data, error, reload, fortnight, setFortnight } = useShiftRecords()

  const header = (
    <header className="flex h-12 items-center">
      <button type="button" onClick={onBack} className="-ml-2 flex h-11 items-center gap-1 rounded-xl px-2 text-[15px] font-medium hover:bg-muted active:bg-muted">
        <ChevronLeft aria-hidden className="size-5" />
        Back
      </button>
    </header>
  )

  if (error && !data) {
    return (
      <main className="mx-auto max-w-[480px] px-4">
        {header}
        <p className="mt-16 text-center text-lg font-medium">We couldn't load the shifts.</p>
        <div className="mt-4 text-center">
          <button type="button" onClick={() => void reload()} className="h-12 rounded-[14px] border border-border px-6 font-medium active:bg-muted">
            Try again
          </button>
        </div>
      </main>
    )
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-[480px] px-4" role="status" aria-label="Loading">
        {header}
        <div className="mt-2 h-7 w-44 rounded-md bg-muted" />
        <div className="mt-6 h-40 rounded-[14px] bg-muted motion-safe:animate-pulse" />
      </main>
    )
  }

  const { me, settings, now, today, fortnights, scope, canFix, people, records: all } = data
  const tz = settings.timezone
  const own = scope === 'own'
  const shown = fortnight ?? fortnights[0]
  const at = fortnights.indexOf(shown)
  const label = at === 0 ? 'This fortnight' : at === 1 ? 'Last fortnight' : rangeLabel(shown)
  const chosen = people.find((p) => p.id === person) ?? null
  const records = chosen ? all.filter((r) => r.user.id === chosen.id) : all
  const done = records.filter((r) => r.session.worked_min !== null)
  // Every counting session on the shift, as the hours export counts them. Voided ones never count.
  const workedMin = records.reduce((sum, r) => sum + [r.session, ...r.other_sessions].reduce((s, x) => s + (x.worked_min ?? 0), 0), 0)
  const voidedCount = records.reduce((n, r) => n + r.voided.length, 0)
  const noPhotos = records.filter((r) => r.session.clock_in && r.photos.length === 0).length
  const days = [...new Set(records.map((r) => r.shift.date))]
  const countFor = (id: string) => all.filter((r) => r.user.id === id).length
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const arrow =
    'flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-border transition-colors hover:bg-muted active:bg-muted disabled:border-border/50 disabled:text-muted-foreground/50 disabled:hover:bg-transparent'

  return (
    <main className="mx-auto min-h-svh max-w-[480px] px-4 pb-12">
      {header}

      <h1 className="px-1 pt-1 text-[28px] leading-tight font-semibold tracking-[-0.01em]">{own ? 'My past shifts' : 'Shift records'}</h1>

      {/* Pinned while the list scrolls: who, which fortnight, and what it adds up to. */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background px-4 pt-3 pb-3">
        {!own && people.length > 1 && (
          // Opens the app's own sheet listing everyone with their count. Grows with the team; nothing slides.
          <button
            type="button"
            onClick={() => setPicking('person')}
            aria-haspopup="dialog"
            className="flex h-12 w-full items-center justify-between rounded-[14px] border border-border bg-background px-3.5 text-left text-base transition-colors hover:bg-muted/60 active:bg-muted"
          >
            <span>
              <span className="text-muted-foreground">Showing: </span>
              <span className="font-semibold">{chosen ? shortName(chosen.full_name) : 'Everyone'}</span>
            </span>
            <ChevronDown aria-hidden className="size-5 text-muted-foreground" />
          </button>
        )}

        <div className={cn('flex items-center gap-2', !own && people.length > 1 && 'mt-2.5')}>
          <button type="button" aria-label="Earlier fortnight" disabled={at >= fortnights.length - 1} onClick={() => setFortnight(fortnights[at + 1])} className={arrow}>
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          {/* Tapping the label lists every fortnight still kept, for a long jump back. */}
          <button
            type="button"
            onClick={() => setPicking('fortnight')}
            aria-haspopup="dialog"
            aria-label={`${label}, ${rangeLabel(shown)}. Choose a fortnight`}
            className="min-w-0 flex-1 rounded-[14px] py-0.5 text-center transition-colors hover:bg-muted/60 active:bg-muted"
          >
            <span className="inline-flex items-center gap-1 text-base font-semibold">
              {label}
              <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
            </span>
            <span className="block text-sm text-muted-foreground">{at <= 1 ? rangeLabel(shown) : 'Tap to choose a fortnight'}</span>
          </button>
          <button type="button" aria-label="Later fortnight" disabled={at <= 0} onClick={() => setFortnight(at - 1 === 0 ? null : fortnights[at - 1])} className={arrow}>
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>

        <p aria-live="polite" className="mt-2 text-center text-sm text-muted-foreground">
          {plural(done.length, 'shift')} · {formatDuration(workedMin)}
          {own && ' worked'}
          {noPhotos > 0 && <span className="text-warn"> · {noPhotos} with no photos</span>}
        </p>
        {voidedCount > 0 && (
          // Hidden by default: a voided clock-in counts nowhere. Shown, it stays struck through on its shift.
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              aria-pressed={showVoided}
              onClick={() => setShowVoided((v) => !v)}
              className={cn(
                'flex h-9 items-center rounded-full border px-3 text-sm font-medium transition-colors',
                showVoided ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:bg-muted active:bg-muted',
              )}
            >
              Show voided ({voidedCount})
            </button>
          </div>
        )}
      </div>

      {records.length === 0 ? (
        <p className="border-b border-border px-1 py-3 text-[15px] text-muted-foreground">
          {chosen ? `No shifts for ${shortName(chosen.full_name)} in this fortnight.` : 'No shifts in this fortnight yet.'}
        </p>
      ) : (
        days.map((day) => (
          <section key={day} aria-labelledby={`day-${day}`}>
            <h2 id={`day-${day}`} className="px-1 pt-4 pb-0.5 text-[13px] font-medium text-muted-foreground">
              {day === today ? 'Today' : formatDateShort(day)}
            </h2>
            <ul>
              {records
                .filter((r) => r.shift.date === day)
                .map((r) => (
                  <li key={r.shift.id}>
                    <RecordRow record={r} own={own} tz={tz} now={now} today={today} showVoided={showVoided} onOpen={() => setOpen(r)} />
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}

      <PickerSheet
        open={picking === 'person'}
        onOpenChange={(o) => !o && setPicking(null)}
        title="Show shifts for"
        description={`${label} · ${rangeLabel(shown)}`}
        value={person ?? ''}
        onPick={(v) => setPerson(v || null)}
        options={[
          { value: '', label: 'Everyone', detail: plural(all.length, 'shift'), disc: <Users /> },
          ...people.map((p) => ({ value: p.id, label: shortName(p.full_name), detail: plural(countFor(p.id), 'shift'), disc: p.full_name[0] })),
        ]}
      />
      <PickerSheet
        open={picking === 'fortnight'}
        onOpenChange={(o) => !o && setPicking(null)}
        title="Choose a fortnight"
        description={`Records are kept for ${settings.photo_retention_months} months.`}
        value={shown}
        onPick={(v) => setFortnight(v === fortnights[0] ? null : v)}
        options={fortnights.map((f, i) => ({
          value: f,
          label: i === 0 ? 'This fortnight' : i === 1 ? 'Last fortnight' : rangeLabel(f),
          detail: i <= 1 ? rangeLabel(f) : undefined,
        }))}
      />
      {open && (
        <ShiftRecordSheet
          key={open.shift.id}
          record={open}
          settings={settings}
          now={now}
          onOpenChange={(o) => !o && setOpen(null)}
          fixer={canFix ? me : undefined}
          onChanged={() => void reload()}
          showVoided={showVoided}
        />
      )}
    </main>
  )
}

function RecordRow({
  record,
  own,
  tz,
  now,
  today,
  showVoided,
  onOpen,
}: {
  record: ShiftRecord
  own: boolean
  tz: string
  now: string
  today: string
  showVoided: boolean
  onOpen: () => void
}) {
  const { shift, user, session, photos, notes, flags } = record
  const type = shift.type === 'morning' ? 'Morning' : 'Night'
  const inAt = session.clock_in?.effective_time
  const outAt = session.clock_out?.effective_time
  // Today's shift may still be starting; only an earlier day reads as missed.
  const missed = !inAt && shift.date < today
  const line = !inAt
    ? missed
      ? "Didn't clock in"
      : 'Not clocked in yet'
    : !outAt
      ? `On shift · in ${formatClock(inAt, tz)} · ${formatDuration(Math.max(0, Math.round((Date.parse(now) - Date.parse(inAt)) / 60_000)))} so far`
      : `In ${formatClock(inAt, tz)} · Out ${formatClock(outAt, tz)} · ${formatDuration(session.worked_min ?? 0)}`
  const openFlags = flags.filter((f) => f.resolved_at === null)
  const tag = 'mt-2 mr-1 inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium [&_svg]:size-3.5'

  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 border-b border-border px-1 py-3 text-left hover:bg-muted/60 active:bg-muted">
      {own ? (
        <Disc tone="neutral">{shift.type === 'morning' ? <Sunrise /> : <Moon />}</Disc>
      ) : (
        <Disc tone="neutral">
          <span className="text-[15px] font-semibold">{user.full_name[0]}</span>
        </Disc>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-base leading-snug font-medium">
          {own ? `${type} shift` : shortName(user.full_name)}
          {!own && <span className="font-normal text-muted-foreground"> · {type}</span>}
        </span>
        <span className={cn('block text-sm leading-snug', missed ? 'text-warn' : 'text-muted-foreground')}>{line}</span>

        {photos.length > 0 && (
          <span className="mt-2 flex items-center gap-1">
            {photos.slice(0, STRIP).map((p) => (
              <span key={p.id} className="size-10 overflow-hidden rounded-lg bg-muted">
                <PhotoThumb photo={p} />
              </span>
            ))}
            {photos.length > STRIP && <span className="ml-1 text-[13px] font-medium text-muted-foreground">+{photos.length - STRIP}</span>}
          </span>
        )}

        {(inAt && photos.length === 0) || openFlags.length > 0 || notes.length > 0 || (showVoided && record.voided.length > 0) ? (
          <span className="block">
            {showVoided && record.voided.length > 0 && (
              <span className={cn(tag, 'bg-muted text-muted-foreground line-through')}>
                {record.voided.length === 1 ? `Voided in ${formatClock(record.voided[0].clock_in.effective_time, tz)}` : `${record.voided.length} voided`}
              </span>
            )}
            {inAt && photos.length === 0 && (
              <span className={cn(tag, 'bg-warn-soft text-warn')}>
                <Camera aria-hidden />
                No photos
              </span>
            )}
            {openFlags.length > 0 && (
              <span className={cn(tag, 'bg-warn-soft text-warn')}>
                {capital(FLAG_LABEL[openFlags[0].kind])}
                {openFlags.length > 1 && ` +${openFlags.length - 1}`}
              </span>
            )}
            {notes.length > 0 && (
              <span className={cn(tag, 'bg-muted text-foreground')}>
                <MessageSquare aria-hidden />
                {notes.length} {notes.length === 1 ? 'note' : 'notes'}
              </span>
            )}
          </span>
        ) : null}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </button>
  )
}
