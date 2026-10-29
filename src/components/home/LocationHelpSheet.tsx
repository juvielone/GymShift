// How to turn location back on, for a site the browser has blocked. Steps for this phone come first.
// "Check again" only re-reads the permission; it never clocks anything.
import { useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { getLocationPermission } from '@/lib/geolocation'

type Platform = 'ios' | 'android'

const STEPS: Record<Platform, { title: string; steps: string[] }> = {
  ios: {
    title: 'iPhone (Safari)',
    steps: [
      'Tap aA next to the web address, then Website Settings › Location › Allow.',
      'Still blocked? Open Settings › Privacy & Security › Location Services. Turn it on and set Safari Websites to While Using.',
    ],
  },
  android: {
    title: 'Android (Chrome)',
    steps: [
      'Tap the icon left of the web address, then Permissions › Location › Allow.',
      "Make sure your phone's Location is on: swipe down from the top and tap Location.",
    ],
  },
}

const detected: Platform = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) ? 'ios' : 'android'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called when the permission is no longer blocked, so home can refresh its warning. */
  onFixed: () => void
}

export function LocationHelpSheet({ open, onOpenChange, onFixed }: Props) {
  const [still, setStill] = useState(false)
  const order: Platform[] = detected === 'ios' ? ['ios', 'android'] : ['android', 'ios']

  async function check() {
    const state = await getLocationPermission()
    if (state === 'denied') {
      setStill(true)
      return
    }
    setStill(false)
    onOpenChange(false)
    onFixed()
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        setStill(false)
        onOpenChange(o)
      }}
    >
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">Turn on location</DrawerTitle>
          <DrawerDescription className="text-[15px]">
            Location is only checked when you tap Clock in or Clock out, to show you're at the gym.
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-4 overflow-y-auto px-4 pb-2">
          {order.map((p) => (
            <section key={p}>
              <h3 className="text-base font-semibold">{STEPS[p].title}</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-[15px] leading-snug">
                {STEPS[p].steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </section>
          ))}
          <p className="rounded-xl bg-muted px-3 py-2.5 text-[15px] leading-snug">
            Opened this from WhatsApp or Instagram? Use the ⋯ menu to open it in Safari or Chrome.
          </p>
        </div>

        <DrawerFooter>
          {still && (
            <p role="alert" className="text-center text-[15px] font-medium text-warn">
              Still blocked. Try the steps above, then check again.
            </p>
          )}
          <button
            type="button"
            onClick={() => void check()}
            className="h-14 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press"
          >
            Check again
          </button>
          <button type="button" onClick={() => onOpenChange(false)} className="h-14 rounded-[14px] border border-border text-lg font-medium active:bg-muted">
            Close
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
