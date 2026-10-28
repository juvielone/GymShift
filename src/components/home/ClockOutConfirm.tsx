// "Clock out now?" — only shown before the approved length is reached, because a clock-out
// can't be undone by staff (records are append-only; only Carly can correct times).
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workedLabel: string
  markLabel: string
  onConfirm: () => void
}

export function ClockOutConfirm({ open, onOpenChange, workedLabel, markLabel, onConfirm }: Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">Clock out now?</DrawerTitle>
          <DrawerDescription className="text-[15px]">
            You've worked {workedLabel}. Your shift time is up at {markLabel}.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <button
            type="button"
            onClick={onConfirm}
            className="h-14 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press"
          >
            Yes, clock out
          </button>
          <button type="button" onClick={() => onOpenChange(false)} className="h-14 rounded-[14px] border border-border text-lg font-medium active:bg-muted">
            Keep working
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
