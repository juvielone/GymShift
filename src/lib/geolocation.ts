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
