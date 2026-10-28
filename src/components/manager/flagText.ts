// Neutral, plain wording for flag kinds — a note to check, never an accusation.
import type { FlagKind } from '@/types'

export const FLAG_LABEL: Record<FlagKind, string> = {
  off_site: 'away from the gym',
  no_location: 'no location',
  unscheduled: 'not rostered',
  no_show: "didn't clock in",
  missing_clock_out: 'no clock-out',
  over_without_extension: 'over approved time',
}
