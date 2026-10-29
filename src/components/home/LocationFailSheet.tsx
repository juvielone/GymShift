// Shown when a clock tap got no location. Nothing is saved yet: "Try again" re-locates, and
// "Clock in anyway" saves now with no location, which Carly checks. Never blocks the clock.
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import type { LocationStatus } from '@/types'

const REASON: Record<Exclude<LocationStatus, 'ok'>, string> = {
  denied: 'Location is blocked for this site.',
  timeout: 'Your phone took too long to find your location.',
  unavailable: "Your phone couldn't find your location.",
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: 'in' | 'out'
  status: Exclude<LocationStatus, 'ok'>
  onRetry: () => void
  onAnyway: () => void
  onHelp: () => void
}

export function LocationFailSheet({ open, onOpenChange, kind, status, onRetry, onAnyway, onHelp }: Props) {
  const verb = kind === 'in' ? 'Clock in' : 'Clock out'
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">We couldn't get your location</DrawerTitle>
          <DrawerDescription className="text-[15px]">
            {REASON[status]} You can still {verb.toLowerCase()}: your time is saved and Carly will check it.
          </DrawerDescription>
        </DrawerHeader>
        {status === 'denied' && (
          <button type="button" onClick={onHelp} className="mx-4 min-h-11 text-left text-[15px] font-medium underline underline-offset-4">
            How to turn it on
          </button>
        )}
        <DrawerFooter>
          <button
            type="button"
            onClick={onRetry}
            className="h-14 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press"
          >
            Try again
          </button>
          <button type="button" onClick={onAnyway} className="h-14 rounded-[14px] border border-border text-lg font-medium active:bg-muted">
            {verb} anyway
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
