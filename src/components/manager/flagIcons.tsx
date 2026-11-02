// One icon per flag kind, shared by the dashboard list and the shift sheet.
import type { ReactNode } from 'react'
import { CalendarClock, CalendarX, LogOut, MapPin, MapPinOff, Timer, TimerReset, UserX } from 'lucide-react'
import type { FlagKind } from '@/types'

export const FLAG_ICON: Record<FlagKind, ReactNode> = {
  off_site: <MapPin />,
  no_location: <MapPinOff />,
  unscheduled: <CalendarX />,
  no_show: <UserX />,
  missing_clock_out: <LogOut />,
  over_without_extension: <Timer />,
  short_session: <TimerReset />,
  off_start: <CalendarClock />,
}
