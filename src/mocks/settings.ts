import type { SiteSettings } from '@/types'

export const settings: SiteSettings = {
  site_name: 'World Gym Macquarie Park',
  timezone: 'Australia/Sydney',
  // The gym's coordinates (confirmed 2 Nov 2026). The radius is still a placeholder (PRD open question).
  gym_lat: -33.78040309069026,
  gym_lng: 151.12136047301382,
  radius_m: 150,
  no_show_after_min: 90,
  missing_out_after_min: 30,
  standard_shift_min: 180,
  max_shift_min: 210,
  max_extension_request_min: 30,
  roster_anchor_date: '2026-10-26',
  default_morning_start: '07:00',
  default_night_start: '19:00',
  max_photos_per_shift: 10,
  photo_upload_window_min: 180,
  photo_remove_window_min: 10,
  photo_retention_months: 6,
  late_photo_min_days: 2,
  start_mismatch_min: 90,
  short_session_flag_min: 2,
  over_length_grace_min: 10,
  auto_close_after_min: 120,
  updated_by: null,
  updated_at: null,
}
