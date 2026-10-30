// One work photo, big. The person who added it can remove it for a few minutes (a mistake);
// after that only Carly can. Removing keeps the record and deletes only the image.
import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { removePhoto } from '@/data'
import type { Photo, SiteSettings, Timestamp } from '@/types'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { PhotoThumb } from '@/components/home/PhotosRow'
import { formatClock } from '@/lib/format'
import { canRemoveOwnPhoto } from '@/lib/rules'

interface Props {
  photo: Photo
  index: number
  total: number
  userId: string
  settings: SiteSettings
  now: Timestamp
  onOpenChange: (open: boolean) => void
  onRemoved: () => void
}

export function PhotoSheet({ photo, index, total, userId, settings, now, onOpenChange, onRemoved }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tz = settings.timezone
  const removable = photo.user_id === userId && canRemoveOwnPhoto(photo.uploaded_at, now, settings)
  const removeUntil = formatClock(new Date(Date.parse(photo.uploaded_at) + settings.photo_remove_window_min * 60_000).toISOString(), tz)

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await removePhoto({ photoId: photo.id, userId })
      onRemoved()
      onOpenChange(false)
    } catch {
      setError('Not removed yet. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">
            Photo {index + 1} of {total}
          </DrawerTitle>
          <DrawerDescription className="text-[15px]">Added {formatClock(photo.uploaded_at, tz)}. Carly can see it.</DrawerDescription>
        </DrawerHeader>

        <div className="px-4">
          <div className="flex max-h-[55svh] min-h-48 items-center justify-center overflow-hidden rounded-[14px] bg-muted">
            <PhotoThumb photo={photo} className="max-h-[55svh] object-contain" />
          </div>
        </div>

        <DrawerFooter>
          <p aria-live="polite" className="text-center text-sm text-warn empty:hidden">
            {error}
          </p>
          {removable && (
            <>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="flex h-14 items-center justify-center gap-2 rounded-[14px] border border-border text-lg font-medium transition-colors hover:bg-muted active:bg-muted disabled:text-muted-foreground"
              >
                {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
                Remove this photo
              </button>
              <p className="text-center text-sm text-muted-foreground">Added by mistake? You can remove it until {removeUntil}.</p>
            </>
          )}
          <button type="button" onClick={() => onOpenChange(false)} className="h-11 rounded-[14px] text-base font-medium text-muted-foreground active:bg-muted">
            Close
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
