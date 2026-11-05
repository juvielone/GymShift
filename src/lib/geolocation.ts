// One-shot location fix for clocking in or out. Called only at the moment of the tap — never watched.
// Always resolves (never rejects): a denied, slow or missing fix becomes a status the server saves and flags.
import type { ClockLocation } from '@/data'

/** Keeps the whole clock action inside the PRD's 5-second budget on mobile data. */
const FIX_TIMEOUT_MS = 4000

export type DevLocationMode = 'real' | 'gym' | 'away' | 'denied' | 'timeout' | 'unavailable'

let devMode: DevLocationMode = 'real'
let devGym: { lat: number; lng: number } | null = null

/** Dev switcher only: fake the next fixes so every location state can be checked at a desk. */
export function setDevLocationMode(mode: DevLocationMode, gym: { lat: number; lng: number }): void {
  devMode = mode
  devGym = gym
}

/** Dev switcher only: the current choice, so it survives signing in as someone else. */
export function getDevLocationMode(): DevLocationMode {
  return devMode
}

export type LocationPermission = 'granted' | 'prompt' | 'denied' | 'unknown'

/**
 * Whether the browser will give a location, checked before the tap so a blocked site can be fixed first.
 * Never rejects: browsers without the Permissions API (older iOS Safari) report 'unknown'. Asks nothing.
 */
export async function getLocationPermission(): Promise<LocationPermission> {
  if (import.meta.env.DEV && devMode !== 'real') return devMode === 'denied' ? 'denied' : 'granted'
  try {
    if (!('geolocation' in navigator)) return 'denied'
    if (!navigator.permissions?.query) return 'unknown'
    const { state } = await navigator.permissions.query({ name: 'geolocation' })
    return state
  } catch {
    return 'unknown'
  }
}

export function getClockLocation(): Promise<ClockLocation> {
  if (import.meta.env.DEV && devMode !== 'real' && devGym) {
    const gym = devGym
    const fake: Record<Exclude<DevLocationMode, 'real'>, ClockLocation> = {
      gym: { lat: gym.lat + 0.0002, lng: gym.lng + 0.0001, accuracy_m: 12 },
      away: { lat: gym.lat + 0.01, lng: gym.lng + 0.008, accuracy_m: 20 },
      denied: { status: 'denied' },
      timeout: { status: 'timeout' },
      unavailable: { status: 'unavailable' },
    }
    return new Promise((resolve) => setTimeout(() => resolve(fake[devMode as Exclude<DevLocationMode, 'real'>]), 700))
  }
  return getRealLocation()
}

/**
 * For setting up and testing the gym point only (never for clocking): keeps listening while GPS sharpens, up
 * to `maxMs`, and settles on the most accurate reading. Indoors a phone's first reading is often Wi-Fi or
 * cell based (±40–100 m or worse); GPS can take 5–30 s to tighten. `onReading` reports each improvement so
 * the sheet can show "±64 m … ±18 m". Stops as soon as a reading is within `goodEnoughM`. Never rejects.
 * Returns the result and a stop function (for closing the sheet early). Real GPS, never the dev switcher.
 */
export function getBestRealLocation(opts: { goodEnoughM: number; maxMs: number; onReading?: (accuracyM: number) => void }): {
  result: Promise<ClockLocation>
  stop: () => void
} {
  if (!('geolocation' in navigator)) return { result: Promise.resolve({ status: 'unavailable' }), stop: () => {} }
  let stop = () => {}
  const result = new Promise<ClockLocation>((resolve) => {
    let best: Extract<ClockLocation, { lat: number }> | null = null
    let settled = false
    const finish = (value: ClockLocation) => {
      if (settled) return
      settled = true
      navigator.geolocation.clearWatch(watchId)
      clearTimeout(timer)
      resolve(value)
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const reading = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy_m: Math.round(pos.coords.accuracy) }
        if (!best || reading.accuracy_m < best.accuracy_m) {
          best = reading
          opts.onReading?.(reading.accuracy_m)
        }
        if (reading.accuracy_m <= opts.goodEnoughM) finish(reading)
      },
      (err) => {
        // A late timeout or a blip after a good reading keeps that reading; only "no reading at all" fails.
        if (err.code === err.PERMISSION_DENIED) finish({ status: 'denied' })
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    )
    const timer = setTimeout(() => finish(best ?? { status: 'timeout' }), opts.maxMs)
    stop = () => finish(best ?? { status: 'timeout' })
  })
  return { result, stop: () => stop() }
}

/** The phone's real position, never the dev switcher's fake one: for setting and testing the gym point. */
export function getRealLocation(): Promise<ClockLocation> {
  if (!('geolocation' in navigator)) return Promise.resolve({ status: 'unavailable' })
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy_m: Math.round(pos.coords.accuracy) }),
      (err) =>
        resolve({ status: err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: FIX_TIMEOUT_MS, maximumAge: 0 },
    )
  })
}
