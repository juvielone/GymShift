import type { ClockEvent } from '@/types'
import { ANA, LINH, JOSH, PRIYA, TOMAS, shiftId } from './ids'

// Past shifts up to MOCK_NOW (28 Oct, 7:40 pm). Scenarios:
//  26 Oct morning  Josh  forgot to clock out; clocked out from home at 1:40 pm → corrected to 10:00 (correction-01)
//  26 Oct night    Tomas  late (no-show flag at 19:15), then 3h 20m with no extension → flagged, NOT cut
//  27 Oct morning  Priya  clocked in 420 m away (±25 m) → off-site flag (open)
//  27 Oct 1–2 pm   Tomas  unscheduled visit to restock → unscheduled flag (open), hours still counted
//  27 Oct night    Linh   poor GPS (260 m ±140 m) → NOT flagged; 3h 25m with approved 25-min extension → NOT flagged
//  28 Oct morning  Ana    location permission denied → still saved, no-location flag (open)
//  28 Oct night    Josh  clocked in, shift in progress (pending extension request)
const e = (
  id: string,
  user_id: string,
  shift_id: string | null,
  kind: 'in' | 'out',
  server_time: string,
  loc: [lat: number, lng: number, accuracy_m: number, distance_m: number] | 'denied',
): ClockEvent =>
  loc === 'denied'
    ? { id, user_id, shift_id, kind, server_time, location_status: 'denied', lat: null, lng: null, accuracy_m: null, distance_m: null }
    : { id, user_id, shift_id, kind, server_time, location_status: 'ok', lat: loc[0], lng: loc[1], accuracy_m: loc[2], distance_m: loc[3] }

export const clockEvents: ClockEvent[] = [
  e('ce-01', JOSH, shiftId('2026-10-26', 'morning'), 'in', '2026-10-26T07:00:00+11:00', [-33.77715, 151.12045, 10, 35]),
  e('ce-02', JOSH, shiftId('2026-10-26', 'morning'), 'out', '2026-10-26T13:40:00+11:00', [-33.79870, 151.07420, 18, 6200]),
  e('ce-03', TOMAS, shiftId('2026-10-26', 'night'), 'in', '2026-10-26T19:22:00+11:00', [-33.77735, 151.12060, 15, 55]),
  e('ce-04', TOMAS, shiftId('2026-10-26', 'night'), 'out', '2026-10-26T22:42:00+11:00', [-33.77728, 151.12052, 12, 48]),
  e('ce-05', PRIYA, shiftId('2026-10-27', 'morning'), 'in', '2026-10-27T07:03:00+11:00', [-33.78065, 151.11745, 25, 420]),
  e('ce-06', PRIYA, shiftId('2026-10-27', 'morning'), 'out', '2026-10-27T10:01:00+11:00', [-33.77722, 151.12040, 8, 40]),
  e('ce-07', TOMAS, null, 'in', '2026-10-27T13:05:00+11:00', [-33.77740, 151.12065, 20, 60]),
  e('ce-08', TOMAS, null, 'out', '2026-10-27T14:10:00+11:00', [-33.77731, 151.12057, 14, 52]),
  e('ce-09', LINH, shiftId('2026-10-27', 'night'), 'in', '2026-10-27T18:59:00+11:00', [-33.77895, 151.12210, 140, 260]),
  e('ce-10', LINH, shiftId('2026-10-27', 'night'), 'out', '2026-10-27T22:24:00+11:00', [-33.77725, 151.12048, 10, 45]),
  e('ce-11', ANA, shiftId('2026-10-28', 'morning'), 'in', '2026-10-28T07:00:00+11:00', 'denied'),
  e('ce-12', ANA, shiftId('2026-10-28', 'morning'), 'out', '2026-10-28T09:58:00+11:00', [-33.77719, 151.12043, 9, 38]),
  e('ce-13', JOSH, shiftId('2026-10-28', 'night'), 'in', '2026-10-28T18:57:00+11:00', [-33.77712, 151.12041, 10, 30]),
]
