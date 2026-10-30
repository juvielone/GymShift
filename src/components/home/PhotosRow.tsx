// Work photos as one more status row under the pass, with the shift's photos in a strip inside it.
// One tap opens the phone's own picker. A photo that didn't save turns amber with a retry; nothing blocks.
import { useEffect, useState } from 'react'
import { Camera, ImageIcon, Plus, RotateCcw } from 'lucide-react'
import { getPhotoUrl } from '@/data'
import type { Photo, SiteSettings, Timestamp } from '@/types'
import type { QueuedPhoto } from '@/hooks/usePhotoUploads'
import { StatusRow } from '@/components/home/StatusRows'
import { formatClock } from '@/lib/format'
import { compareTs, photoWindowClosesAt } from '@/lib/rules'
import { cn } from '@/lib/utils'

interface Props {
  photos: Photo[]
  queue: QueuedPhoto[]
  notice: string | null
  settings: SiteSettings
  now: Timestamp
  /** Clock-out time once the shift is done; the upload window counts from it. */
  clockOut: Timestamp | null
  onPick: () => void
  onRetry: (key: string) => void
  onOpen: (photo: Photo) => void
}

const tile = 'relative size-14 shrink-0 overflow-hidden rounded-[10px]'

export function PhotosRow({ photos, queue, notice, settings, now, clockOut, onPick, onRetry, onOpen }: Props) {
  const tz = settings.timezone
  const max = settings.max_photos_per_shift
  const closesAt = photoWindowClosesAt(clockOut, settings)
  const open = closesAt === null || compareTs(now, closesAt) < 0
  const saving = queue.filter((p) => p.status === 'saving').length
  const failed = queue.filter((p) => p.status === 'failed')
  const room = max - photos.length - saving
  const until = closesAt ? formatClock(closesAt, tz) : null

  if (photos.length === 0 && queue.length === 0) {
    if (!open) return null
    // Done with no photos: amber until they arrive, because Carly checks every shift's photos.
    return clockOut ? (
      <StatusRow icon={<Camera />} tone="warn" title="No photos yet" detail={`Add them by ${until}. Carly checks them.`} onClick={onPick} />
    ) : (
      <StatusRow icon={<Camera />} tone="neutral" title="Add work photos" detail={`Up to ${max} for this shift. Carly can see them.`} onClick={onPick} />
    )
  }

  const detail =
    photos.length >= max
      ? "That's the most for one shift."
      : !open
        ? 'Saved for Carly.'
        : until
          ? `Carly can see these. Add more until ${until}.`
          : 'Carly can see these.'

  const problem = failed[0]?.problem
  const problemText =
    problem === 'retry'
      ? `${failed.length === 1 ? '1 photo is' : `${failed.length} photos are`} not saved yet. Tap to try again.`
      : problem === 'full'
        ? 'This shift already has the most photos. Tap to clear it.'
        : problem === 'closed'
          ? 'Photos for this shift have closed. Tap to clear it.'
          : problem === 'unreadable'
            ? "We couldn't read that file as a photo. Tap to clear it."
            : null

  return (
    <div className="flex w-full items-start gap-3 border-b border-border px-1 py-3">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground [&_svg]:size-[18px]">
        <Camera />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base leading-snug font-medium">
          Work photos · {photos.length} of {max}
        </p>
        <p className="text-sm leading-snug text-muted-foreground">{detail}</p>

        <ul aria-label="Work photos" className="-mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {photos.map((p, i) => (
            <li key={p.id}>
              <button type="button" onClick={() => onOpen(p)} aria-label={`Photo ${i + 1}. Open`} className={cn(tile, 'bg-muted active:opacity-80')}>
                <PhotoThumb photo={p} />
              </button>
            </li>
          ))}
          {queue.map((q) =>
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
                  onClick={() => onRetry(q.key)}
                  aria-label={q.problem === 'retry' ? 'Photo not saved. Try again' : 'Photo not added. Clear it'}
                  className={cn(tile, 'flex items-center justify-center bg-warn-soft text-warn active:opacity-80')}
                >
                  <RotateCcw aria-hidden className="size-5" />
                </button>
              </li>
            ),
          )}
          {open && room > 0 && (
            <li>
              <button
                type="button"
                onClick={onPick}
                aria-label="Add photos"
                className={cn(tile, 'flex items-center justify-center border border-dashed border-muted-foreground/60 bg-background transition-colors hover:bg-muted/60 active:bg-muted')}
              >
                <Plus aria-hidden className="size-[22px]" />
              </button>
            </li>
          )}
        </ul>

        <div aria-live="polite">
          {problemText && <p className="mt-2 text-sm leading-snug text-warn">{problemText}</p>}
          {notice && <p className="mt-2 text-sm leading-snug text-muted-foreground">{notice}</p>}
        </div>
      </div>
    </div>
  )
}

/** A saved photo. Seeded demo rows have no image, so they show a quiet placeholder. */
export function PhotoThumb({ photo, className }: { photo: Photo; className?: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void getPhotoUrl(photo).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [photo])
  if (url) return <img src={url} alt="" className={cn('size-full object-cover', className)} />
  return (
    <span className={cn('flex size-full items-center justify-center bg-muted text-muted-foreground', className)}>
      {url === null && <ImageIcon aria-hidden className="size-5" />}
    </span>
  )
}
