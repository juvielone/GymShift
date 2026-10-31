// One shift's record: clock times (with location and corrections), worked time, photos, notes and
// flags. Facts first, like the flag sheet. Tapping a photo shows it large inside the sheet, with
// swipe and next/previous. Read-only: corrections and resolving stay in the flag sheet.
import { useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, CircleAlert, Clock, MessageSquare, Package } from 'lucide-react'
import type { EffectiveClockEvent, ShiftRecord } from '@/data'
import type { NoteTag, SiteSettings, Timestamp } from '@/types'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Disc } from '@/components/common/ListParts'
import { PhotoThumb } from '@/components/home/PhotosRow'
import { FLAG_ICON } from '@/components/manager/flagIcons'
import { FLAG_LABEL } from '@/components/manager/flagText'
import { firstName, formatClock, formatDateShort, formatDuration, formatTimeRange, zonedTimestamp } from '@/lib/format'
import { compareTs, isOffSite } from '@/lib/rules'
import { cn } from '@/lib/utils'

const NOTE_ICON: Record<NoteTag, ReactNode> = {
  supplies_low: <Package />,
  issue: <CircleAlert />,
  general: <MessageSquare />,
  running_late: <Clock />,
}
const NOTE_LABEL: Record<NoteTag, string> = {
  supplies_low: 'Supplies low',
  issue: 'Something wrong',
  general: 'Note',
  running_late: 'Running late',
}

interface Props {
  record: ShiftRecord
  settings: SiteSettings
  now: Timestamp
  onOpenChange: (open: boolean) => void
}

export function ShiftRecordSheet({ record, settings, now, onOpenChange }: Props) {
  const [viewing, setViewing] = useState<number | null>(null)
  const { shift, user, session, photos, notes, flags } = record
  const tz = settings.timezone
  const name = firstName(user.full_name)
  const started = compareTs(now, zonedTimestamp(shift.date, shift.start_time, tz)) >= 0

  return (
    <Drawer open onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">
            {name} · {shift.type === 'morning' ? 'Morning' : 'Night'} shift
          </DrawerTitle>
          <DrawerDescription className="text-[15px]">
            {formatDateShort(shift.date)} · {formatTimeRange(shift.start_time, shift.end_time)}
          </DrawerDescription>
        </DrawerHeader>

        {viewing !== null && photos[viewing] ? (
          <PhotoViewer record={record} index={viewing} tz={tz} onIndex={setViewing} onClose={() => setViewing(null)} />
        ) : (
          <div className="overflow-y-auto px-4 pb-2">
            <dl className="divide-y divide-border border-y border-border">
              <ClockFact label="Clock-in" event={session.clock_in} settings={settings} missing={started ? "Didn't clock in" : 'Not started'} />
              {session.clock_in && <ClockFact label="Clock-out" event={session.clock_out} settings={settings} missing="Still on shift" />}
              {session.worked_min !== null && <Fact label="Worked" value={formatDuration(session.worked_min)} />}
              {record.approved_min > settings.standard_shift_min && <Fact label="Approved up to" value={formatDuration(record.approved_min)} note="Extra time Carly approved" />}
            </dl>

            <h3 className="mt-5 mb-2 flex items-baseline justify-between px-1 text-base font-semibold">
              Photos
              <span className="text-sm font-normal text-muted-foreground">
                {photos.length > 0 ? `${photos.length} of ${settings.max_photos_per_shift}` : 'None'}
              </span>
            </h3>
            {photos.length > 0 ? (
              <ul className="grid grid-cols-3 gap-1.5">
                {photos.map((p, i) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setViewing(i)}
                      aria-label={`Photo ${i + 1}, added ${formatClock(p.uploaded_at, tz)}. Open`}
                      className="block aspect-square w-full overflow-hidden rounded-[10px] bg-muted active:opacity-80"
                    >
                      <PhotoThumb photo={p} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={cn('px-1 text-[15px]', session.clock_in ? 'text-warn' : 'text-muted-foreground')}>No photos for this shift.</p>
            )}

            {notes.length > 0 && (
              <>
                <h3 className="mt-5 mb-1 px-1 text-base font-semibold">Notes</h3>
                <ul>
                  {notes.map((n) => (
                    <li key={n.id} className="flex gap-3 border-b border-border px-1 py-2.5">
                      <Disc tone={n.done_at ? 'ok' : 'neutral'}>{NOTE_ICON[n.tag ?? 'general']}</Disc>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] leading-snug">{n.body}</p>
                        <p className="text-[13px] text-muted-foreground">
                          {NOTE_LABEL[n.tag ?? 'general']} · {formatClock(n.created_at, tz)}
                          {n.done_at && ' · done'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {flags.length > 0 && (
              <>
                <h3 className="mt-5 mb-1 px-1 text-base font-semibold">Flags</h3>
                <ul>
                  {flags.map((f) => (
                    <li key={f.id} className="flex gap-3 border-b border-border px-1 py-2.5">
                      <Disc tone={f.resolved_at ? 'neutral' : 'warn'}>{FLAG_ICON[f.kind]}</Disc>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] leading-snug first-letter:uppercase">{FLAG_LABEL[f.kind]}</p>
                        <p className="text-[13px] text-muted-foreground">
                          {formatClock(f.created_at, tz)} · {f.detail}
                          {f.resolved_at ? ' · resolved' : ' · to check'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <DrawerFooter>
          <button type="button" onClick={() => onOpenChange(false)} className="h-11 rounded-[14px] text-base font-medium text-muted-foreground active:bg-muted">
            Close
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function Fact({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-4 px-1 py-2.5">
      <dt className="shrink-0 text-[15px] text-muted-foreground">{label}</dt>
      <dd className={cn('text-right text-[15px] font-medium', warn && 'text-warn')}>
        {value}
        {note && <span className={cn('block text-[13px] font-normal', warn ? 'text-warn' : 'text-muted-foreground')}>{note}</span>}
      </dd>
    </div>
  )
}

const formatDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`)

/** A clock time with where it was taken and, if Carly corrected it, what was recorded. */
function ClockFact({ label, event, settings, missing }: { label: string; event: EffectiveClockEvent | null; settings: SiteSettings; missing: string }) {
  if (!event) return <Fact label={label} value={missing} warn={missing === "Didn't clock in"} />
  const tz = settings.timezone
  const away = event.location_status === 'ok' && isOffSite(event.distance_m, event.accuracy_m, settings)
  const place =
    event.location_status !== 'ok' ? 'No location' : away ? `Away from the gym · ${formatDistance(event.distance_m ?? 0)}` : 'At the gym'
  const note = [place, event.corrected ? `Recorded ${formatClock(event.server_time, tz)}, corrected` : null].filter(Boolean).join(' · ')
  return <Fact label={label} value={formatClock(event.effective_time, tz)} note={note} warn={event.location_status !== 'ok' || away} />
}

/** A photo shown large inside the sheet. Swipe or use the arrows; "All photos" goes back to the grid. */
function PhotoViewer({ record, index, tz, onIndex, onClose }: { record: ShiftRecord; index: number; tz: string; onIndex: (i: number) => void; onClose: () => void }) {
  const { photos } = record
  const photo = photos[index]
  const touchX = useRef<number | null>(null)
  const go = (step: number) => {
    const next = index + step
    if (next >= 0 && next < photos.length) onIndex(next)
  }
  const arrow = 'absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white disabled:opacity-0'

  return (
    <div className="px-4">
      <div
        className="relative flex h-[58svh] items-center justify-center overflow-hidden rounded-[14px] bg-pass"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
        }}
      >
        <PhotoThumb key={photo.id} photo={photo} className="bg-pass object-contain" />
        <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous photo" className={cn(arrow, 'left-2')}>
          <ChevronLeft aria-hidden className="size-6" />
        </button>
        <button type="button" onClick={() => go(1)} disabled={index === photos.length - 1} aria-label="Next photo" className={cn(arrow, 'right-2')}>
          <ChevronRight aria-hidden className="size-6" />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 px-1">
        <p className="text-[15px] text-muted-foreground" aria-live="polite">
          Photo {index + 1} of {photos.length} · added {formatClock(photo.uploaded_at, tz)}
        </p>
        <button type="button" onClick={onClose} className="h-11 shrink-0 rounded-[14px] border border-border px-4 text-[15px] font-semibold hover:bg-muted active:bg-muted">
          All photos
        </button>
      </div>
    </div>
  )
}
