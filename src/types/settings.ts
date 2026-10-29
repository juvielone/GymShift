// Table: site_settings (single row, one site in v1). All business-rule numbers come from here — never hardcode them.
import type { Timestamp, Uuid } from './common'

export interface SiteSettings {
  site_name: string
  timezone: string
  gym_lat: number
  gym_lng: number
  /** Geofence radius in metres (default 150). */
  radius_m: number
  /** Minutes after shift start with no clock-in before a no-show flag (default 15). */
  no_show_after_min: number
  /** Minutes after shift end with no clock-out before a missing-clock-out flag (default 30). */
  missing_out_after_min: number
  /** Standard shift length in minutes (180 = 3h). */
  standard_shift_min: number
  /** Maximum shift length with approved extension(s), in minutes (210 = 3.5h). */
  max_shift_min: number
  /** Maximum minutes in a single extension request (30). */
  max_extension_request_min: number
  /** A Monday that starts a fortnight; every roster/pay fortnight is counted from it in 14-day steps. */
  roster_anchor_date: string
  default_morning_start: string
  default_night_start: string
  max_photos_per_shift: number
  photo_retention_months: number
  /** Who last changed the gym location or radius, and when. null = never changed in the app. */
  updated_by: Uuid | null
  updated_at: Timestamp | null
}
