// Fortnight hours in a sheet, so the dashboard keeps a single row for them. Carly opens it on payday.
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { HoursPanel } from '@/components/manager/HoursPanel'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fortnights: string[]
  current: string
  refreshedAt: string
}

export function HoursSheet({ open, onOpenChange, fortnights, current, refreshedAt }: Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Fortnight hours</DrawerTitle>
          <DrawerDescription>Hours per person from corrected times, with CSV export.</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">
          <HoursPanel fortnights={fortnights} current={current} refreshedAt={refreshedAt} inSheet />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
