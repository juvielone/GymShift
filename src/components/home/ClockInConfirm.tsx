// "Clock in now?" — asked once, only when a clock-in looks unusual: no shift to link to today, or far from
// the rostered start (needsClockInConfirm). An on-time clock-in stays one tap. Answering yes always saves.
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "7:00 pm", or null when there is no shift today. */
  startLabel: string | null
  onConfirm: () => void
}

export function ClockInConfirm({ open, onOpenChange, startLabel, onConfirm }: Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">{startLabel ? 'Clock in now?' : 'Clock in anyway?'}</DrawerTitle>
          <DrawerDescription className="text-[15px]">
            {startLabel ? `Your shift starts at ${startLabel}.` : "You're not on the roster today."} If you clock in, Carly will check it.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <button
            type="button"
            onClick={onConfirm}
            className="h-14 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press"
          >
            Clock in
          </button>
          <button type="button" onClick={() => onOpenChange(false)} className="h-14 rounded-[14px] border border-border text-lg font-medium active:bg-muted">
            Not now
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
