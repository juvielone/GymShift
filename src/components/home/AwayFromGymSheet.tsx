// Shown when a clock-in tap found the phone outside the gym. Nothing is saved yet: "Check again" takes a fresh
// fix (and clocks in straight away if it's now at the gym), and "Clock in anyway" saves this one, which Carly
// checks. Never blocks the clock (CLAUDE.md rule 4); the server still decides the off-site flag.
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { formatDistance } from '@/lib/format'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Metres from the gym, and how sure the phone is of it. */
  distanceM: number
  accuracyM: number
  onRetry: () => void
  onAnyway: () => void
}

export function AwayFromGymSheet({ open, onOpenChange, distanceM, accuracyM, onRetry, onAnyway }: Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">You look far from the gym</DrawerTitle>
          <DrawerDescription className="text-[15px]">
            Your phone says you're about {formatDistance(distanceM)} away (give or take {formatDistance(accuracyM)}). If
            you're at the gym, step inside or near a window and check again. You can still clock in: your time is saved
            and Carly will check it.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <button
            type="button"
            onClick={onRetry}
            className="h-14 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press"
          >
            Check again
          </button>
          <button type="button" onClick={onAnyway} className="h-14 rounded-[14px] border border-border text-lg font-medium active:bg-muted">
            Clock in anyway
          </button>
          <button type="button" onClick={() => onOpenChange(false)} className="min-h-11 text-[15px] font-medium text-muted-foreground">
            Not now
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
