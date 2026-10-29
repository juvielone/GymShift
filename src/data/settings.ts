import type { SiteSettings, Uuid } from '@/types'
import { copy, db, requireUser, roleOf, serverNow } from './store'

/** Allowed geofence radius when Carly sets it in the app. */
export const RADIUS_MIN_M = 50
export const RADIUS_MAX_M = 300

export async function getSettings(): Promise<SiteSettings> {
  return copy(db.settings)
}

/**
 * Manager only. Moves the gym point and radius used for new clock events; past events keep the
 * distance saved with them, so nothing already recorded changes.
 */
export async function updateSiteLocation(input: { userId: Uuid; lat: number; lng: number; radius_m: number }): Promise<SiteSettings> {
  const actor = requireUser(input.userId)
  if (!roleOf(actor).can_manage_users) throw new Error('Only the manager can change site settings')
  if (!Number.isFinite(input.lat) || Math.abs(input.lat) > 90) throw new Error('Latitude must be between -90 and 90')
  if (!Number.isFinite(input.lng) || Math.abs(input.lng) > 180) throw new Error('Longitude must be between -180 and 180')
  if (!Number.isInteger(input.radius_m) || input.radius_m < RADIUS_MIN_M || input.radius_m > RADIUS_MAX_M) {
    throw new Error(`Radius must be ${RADIUS_MIN_M}–${RADIUS_MAX_M} m`)
  }
  Object.assign(db.settings, {
    gym_lat: input.lat,
    gym_lng: input.lng,
    radius_m: input.radius_m,
    updated_by: actor.id,
    updated_at: serverNow(),
  })
  return copy(db.settings)
}
