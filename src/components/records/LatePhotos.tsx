// Late photos, on your own past shift in "My past shifts": after the upload window has closed and until the end
// of the fortnight (or a couple of days after the shift, if later: photoLateUntil()). Plain and a little firm on purpose: it says when the photos were due and that Carly will see
// they came late, and the button is outline, never red, because this isn't the normal way to add photos.
// Saved photos join the sheet's grid above (with a "Late" mark); this block only shows what's still saving.
import { useEffect, useState } from 'react'
import { Camera, Clock, RotateCcw } from 'lucide-react'
import { getPhotoWindow, type PhotoTarget, type PhotoWindow, type ShiftRecord } from '@/data'
import type { SiteSettings } from '@/types'
import { usePhotoUploads } from '@/hooks/usePhotoUploads'
import { formatClock, formatDateShort, localDay } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Props {
  record: ShiftRecord
  userId: string
  settings: SiteSettings
  /** After each photo saves, so the record (and its grid) reloads. */
  onSaved: () => void
}

const tile = 'relative size-14 shrink-0 overflow-hidden rounded-[10px]'

export function LatePhotos({ record, userId, settings, onSaved }: Props) {
  const tz = settings.timezone
  const target: PhotoTarget | null = record.shift ? { shiftId: record.shift.id } : record.session.clock_in ? { clockInId: record.session.clock_in.id } : null
  const count = record.photos.length
  const [win, setWin] = useState<PhotoWindow | null>(null)
  const uploads = usePhotoUploads({ target, userId, room: settings.max_photos_per_shift - count, onSaved })

  // Re-read after each save: the fortnight may have ended while the sheet was open.
  const targetKey = target ? ('shiftId' in target ? target.shiftId : target.clockInId) : null
  useEffect(() => {
    if (!targetKey) return
    let live = true
    const t: PhotoTarget = record.shift ? { shiftId: targetKey } : { clockInId: targetKey }
    void getPhotoWindow({ ...t, userId }).then((w) => live && setWin(w))
    return () => {
      live = false
    }
  }, [targetKey, record.shift, userId, count])

  if (!win || win.state !== 'late' || !win.dueBy) return null
  const full = count >= settings.max_photos_per_shift
  const dueBy = `${formatDateShort(localDay(win.dueBy, tz))}, ${formatClock(win.dueBy, tz)}`
  // The last day photos can go in: the day before the next fortnight starts.
  const lastDay = formatDateShort(localDay(new Date(Date.parse(win.lateUntil) - 60_000).toISOString(), tz))
  const failed = uploads.queue.filter((q) => q.status === 'failed')

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="flex items-start gap-2 px-1 text-[15px] leading-snug text-warn">
        <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>Photos were due by {dueBy}.</span>
      </p>
      <p className="mt-1 px-1 pl-7 text-sm leading-snug text-muted-foreground">
        {full ? "This shift already has the most photos." : `You can still add them until ${lastDay}. Carly will see they were added late.`}
      </p>

      {uploads.queue.length > 0 && (
        <ul aria-label="Photos saving" className="mt-2.5 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {uploads.queue.map((q) =>
            q.status === 'saving' ? (
              <li key={q.key} className={tile} aria-label="Saving photo">
                <img src={q.preview} alt="" className="size-full object-cover" />
                <span className="absolute inset-0 bg-black/35" />
                <span className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-white/35">
                  <span className="upload-bar block h-full w-2/5 rounded-full bg-white" />
                </span>
              </li>
            ) : (
              <li key={q.key}>
                <button
                  type="button"
                  onClick={() => uploads.retry(q.key)}
                  aria-label={q.problem === 'retry' ? 'Photo not saved. Try again' : 'Photo not added. Clear it'}
                  className={cn(tile, 'flex items-center justify-center bg-warn-soft text-warn active:opacity-80')}
                >
                  <RotateCcw aria-hidden className="size-5" />
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      <div aria-live="polite">
        {failed.length > 0 && (
          <p className="mt-2 px-1 text-sm leading-snug text-warn">
            {failed[0].problem === 'retry'
              ? `${failed.length === 1 ? '1 photo is' : `${failed.length} photos are`} not saved yet. Tap to try again.`
              : failed[0].problem === 'closed'
                ? 'Photos for this shift have closed. Tap to clear it.'
                : failed[0].problem === 'full'
                  ? 'This shift already has the most photos. Tap to clear it.'
                  : "We couldn't read that file as a photo. Tap to clear it."}
          </p>
        )}
        {uploads.notice && <p className="mt-2 px-1 text-sm leading-snug text-muted-foreground">{uploads.notice}</p>}
      </div>

      {!full && (
        <button
          type="button"
          onClick={uploads.pick}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-border text-base font-medium transition-colors hover:bg-muted/60 active:bg-muted"
        >
          <Camera aria-hidden className="size-[18px]" />
          Add late photos
        </button>
      )}
    </div>
  )
}
