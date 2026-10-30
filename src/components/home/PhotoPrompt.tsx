// Clock out with no work photos: ask once, "Add your photos first?". Never a block: the second
// button clocks out straight away, and photos can still be added after (until the upload window closes).
import { Camera } from 'lucide-react'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { formatDuration } from '@/lib/format'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Before the approved finish, say so here instead of a second "Clock out now?" question. */
  earlyNote: string | null
  uploadWindowMin: number
  onAddPhotos: () => void
  onClockOut: () => void
}

export function PhotoPrompt({ open, onOpenChange, earlyNote, uploadWindowMin, onAddPhotos, onClockOut }: Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">Add your photos first?</DrawerTitle>
          <DrawerDescription className="text-[15px]">
            Carly checks the photos for every shift. {earlyNote ?? `You can also add them up to ${formatDuration(uploadWindowMin)} after you clock out.`}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <button
            type="button"
            onClick={onAddPhotos}
            className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press"
          >
            <Camera aria-hidden className="size-5" />
            Add photos
          </button>
          <button type="button" onClick={onClockOut} className="h-14 rounded-[14px] border border-border text-lg font-medium transition-colors hover:bg-muted active:bg-muted">
            Clock out without photos
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
