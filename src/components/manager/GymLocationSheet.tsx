// Carly sets the gym point and radius the off-site check uses. She stands in the gym and takes one
// fix, or pastes coordinates from Google Maps. Saving affects new clock events only.
import { useState } from 'react'
import { LoaderCircle, Minus, Plus } from 'lucide-react'
import { RADIUS_MAX_M, RADIUS_MIN_M, updateSiteLocation } from '@/data'
import type { SiteSettings, User } from '@/types'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { smallButton } from '@/components/common/listStyles'
import { getRealLocation } from '@/lib/geolocation'
import { formatDistance, formatLatLng, parseLatLng } from '@/lib/format'
import { distanceMetres, isOffSite } from '@/lib/rules'

/** A fix looser than this would put the gym point in the wrong place; ask her to try again instead. */
const SETUP_ACCURACY_M = 30
const RADIUS_STEP_M = 25

const NO_FIX: Record<'denied' | 'timeout' | 'unavailable', string> = {
  denied: 'Location is blocked for this site. Allow it in your browser, or paste coordinates instead.',
  timeout: 'Your phone took too long to find your location. Try again.',
  unavailable: "Your phone couldn't find your location. Try again, or paste coordinates instead.",
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: SiteSettings
  me: User
  onSaved: () => void
}

export function GymLocationSheet({ open, onOpenChange, settings, me, onSaved }: Props) {
  const [point, setPoint] = useState({ lat: settings.gym_lat, lng: settings.gym_lng })
  const [source, setSource] = useState('Saved point')
  const [radius, setRadius] = useState(settings.radius_m)
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState<'locate' | 'test' | 'save' | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  const changed = point.lat !== settings.gym_lat || point.lng !== settings.gym_lng || radius !== settings.radius_m

  async function takeMyLocation() {
    setBusy('locate')
    setMsg(null)
    const loc = await getRealLocation()
    setBusy(null)
    if ('status' in loc) return setMsg({ tone: 'warn', text: NO_FIX[loc.status] })
    if (loc.accuracy_m > SETUP_ACCURACY_M) {
      return setMsg({ tone: 'warn', text: `Accuracy ±${loc.accuracy_m} m is too loose. Move away from walls or stand near the entrance, then try again.` })
    }
    setPoint({ lat: loc.lat, lng: loc.lng })
    setSource(`From your phone · ±${loc.accuracy_m} m`)
  }

  function applyPasted() {
    const p = parseLatLng(paste)
    if (!p) return setMsg({ tone: 'warn', text: 'Paste two numbers like -33.7769, 151.1203.' })
    setMsg(null)
    setPoint(p)
    setSource('Pasted')
    setPaste('')
  }

  // Checks the draft point and radius from where she stands, using the same rule as clock-ins.
  async function testDistance() {
    setBusy('test')
    setMsg(null)
    const loc = await getRealLocation()
    setBusy(null)
    if ('status' in loc) return setMsg({ tone: 'warn', text: NO_FIX[loc.status] })
    const d = Math.round(distanceMetres(loc.lat, loc.lng, point.lat, point.lng))
    const away = isOffSite(d, loc.accuracy_m, { ...settings, radius_m: radius })
    setMsg({ tone: away ? 'warn' : 'ok', text: `You're ${formatDistance(d)} from the gym (±${loc.accuracy_m} m): ${away ? 'outside, a clock-in here would be flagged' : 'inside'}.` })
  }

  async function save() {
    setBusy('save')
    setMsg(null)
    try {
      await updateSiteLocation({ userId: me.id, lat: point.lat, lng: point.lng, radius_m: radius })
      onSaved()
      onOpenChange(false)
    } catch (e) {
      setMsg({ tone: 'warn', text: e instanceof Error ? e.message : 'Not saved yet. Try again.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">Gym location</DrawerTitle>
          <DrawerDescription className="text-[15px]">Clock-ins further than the radius from this point are flagged for you.</DrawerDescription>
        </DrawerHeader>

        <div className="space-y-5 overflow-y-auto px-4 pb-2">
          <section aria-labelledby="gym-point">
            <h3 id="gym-point" className="text-sm font-medium text-muted-foreground">
              Gym point
            </h3>
            <p className="mt-0.5 text-base font-semibold tabular-nums">{formatLatLng(point.lat, point.lng)}</p>
            <p className="text-sm text-muted-foreground">{source}</p>
            <button type="button" onClick={() => void takeMyLocation()} disabled={busy !== null} className={`${smallButton.ink} mt-3 w-full gap-2`}>
              {busy === 'locate' && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
              {busy === 'locate' ? 'Finding you…' : 'Use my current location'}
            </button>
            <p className="mt-1 text-sm text-muted-foreground">Stand inside the gym when you tap this.</p>
            <div className="mt-3 flex gap-2">
              <label className="sr-only" htmlFor="gym-paste">
                Paste coordinates from Google Maps
              </label>
              <input
                id="gym-paste"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="Or paste from Google Maps"
                inputMode="decimal"
                className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base"
              />
              <button type="button" onClick={applyPasted} disabled={!paste.trim()} className={smallButton.outline}>
                Use
              </button>
            </div>
          </section>

          <section aria-labelledby="gym-radius">
            <h3 id="gym-radius" className="text-sm font-medium text-muted-foreground">
              Radius
            </h3>
            <div className="mt-1 flex items-center gap-3">
              <button
                type="button"
                aria-label="Smaller radius"
                onClick={() => setRadius((r) => Math.max(RADIUS_MIN_M, r - RADIUS_STEP_M))}
                disabled={radius <= RADIUS_MIN_M}
                className={`${smallButton.outline} w-11 px-0`}
              >
                <Minus aria-hidden className="size-5" />
              </button>
              <output aria-live="polite" className="min-w-20 text-center text-xl font-semibold tabular-nums">
                {radius} m
              </output>
              <button
                type="button"
                aria-label="Bigger radius"
                onClick={() => setRadius((r) => Math.min(RADIUS_MAX_M, r + RADIUS_STEP_M))}
                disabled={radius >= RADIUS_MAX_M}
                className={`${smallButton.outline} w-11 px-0`}
              >
                <Plus aria-hidden className="size-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Poor GPS accuracy is allowed for, so a weak signal alone is never flagged.</p>
          </section>

          <section>
            <button type="button" onClick={() => void testDistance()} disabled={busy !== null} className={`${smallButton.outline} w-full gap-2`}>
              {busy === 'test' && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
              Test my distance
            </button>
          </section>

          <div aria-live="polite" className="empty:hidden">
            {msg && <p className={`rounded-xl px-3 py-2.5 text-[15px] leading-snug ${msg.tone === 'ok' ? 'bg-ok-soft' : 'bg-warn-soft text-warn'}`}>{msg.text}</p>}
          </div>
        </div>

        <DrawerFooter>
          <p className="text-center text-sm text-muted-foreground">Applies to new clock-ins only. Past records keep their saved distance.</p>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!changed || busy !== null}
            className="h-14 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press disabled:bg-muted disabled:text-muted-foreground"
          >
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => onOpenChange(false)} className="h-14 rounded-[14px] border border-border text-lg font-medium active:bg-muted">
            Cancel
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
