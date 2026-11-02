// Clock in was tapped while already clocked in (another phone, or a screen that hadn't caught up).
// Nothing was saved; never two open clock-ins. Offer to clock out instead.
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "6:02 pm" */
  sinceLabel: string
  onClockOut: () => void
}

export function AlreadyClockedInSheet({ open, onOpenChange, sinceLabel, onClockOut }: Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">You're already clocked in since {sinceLabel}</DrawerTitle>
          <DrawerDescription className="text-[15px]">Nothing new was saved. Finished? Clock out now.</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <button
            type="button"
            onClick={onClockOut}
            className="h-14 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press"
          >
            Clock out
          </button>
          <button type="button" onClick={() => onOpenChange(false)} className="h-14 rounded-[14px] border border-border text-lg font-medium active:bg-muted">
            Cancel
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
