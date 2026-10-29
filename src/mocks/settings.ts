import type { SiteSettings } from '@/types'

export const settings: SiteSettings = {
  site_name: 'World Gym Macquarie Park',
  timezone: 'Australia/Sydney',
  // TODO: approximate Macquarie Park coordinates — exact gym coordinates are an open question in the PRD.
  gym_lat: -33.7769,
  gym_lng: 151.1203,
  radius_m: 150,
  no_show_after_min: 15,
  missing_out_after_min: 30,
  standard_shift_min: 180,
  max_shift_min: 210,
  max_extension_request_min: 30,
  roster_anchor_date: '2026-10-26',
  default_morning_start: '07:00',
  default_night_start: '19:00',
  max_photos_per_shift: 10,
  photo_retention_months: 6,
}
