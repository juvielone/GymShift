import type { ClockEvent } from '@/types'
import { GLADYS, ANGEL, JOSH, KYLE, GINO, shiftId } from './ids'

// Past shifts up to MOCK_NOW (28 Oct, 6:50 pm). Scenarios:
//  26 Oct morning  Josh  forgot to clock out; clocked out from home at 1:40 pm → corrected to 10:00 (correction-01)
//  26 Oct night    Gino  late (no-show flag at 19:15), then 3h 20m with no extension → flagged, NOT cut
//  26 Oct 3 pm     Angel tapped Clock in at home, out 2 min later → voided by Carly (void-01/02)
//  27 Oct morning  Kyle  clocked in 420 m away (±25 m) → off-site flag (open); never clocked out → closed
//                        automatically at the 10:00 am end at noon (ce-06), notice not answered yet
//  27 Oct 1–2 pm   Gino  unscheduled visit to restock → unscheduled flag (open), hours still counted
//  27 Oct night    Angel   poor GPS (260 m ±140 m) → NOT flagged; 3h 25m with approved 25-min extension → NOT flagged
//  28 Oct morning  Gladys    location permission denied → still saved, no-location flag (open)
//  28 Oct 1:20 pm  Kyle  tapped Clock in at home; "This was a mistake" at 1:31 clocked him out → void request pending
//  28 Oct night    Josh  starts at 7:00 pm, not clocked in yet (clock in and out live to test)
const e = (
  id: string,
  user_id: string,
  shift_id: string | null,
  kind: 'in' | 'out',
  server_time: string,
  loc: [lat: number, lng: number, accuracy_m: number, distance_m: number] | 'denied',
): ClockEvent =>
  loc === 'denied'
    ? { id, user_id, shift_id, kind, server_time, location_status: 'denied', lat: null, lng: null, accuracy_m: null, distance_m: null, source: 'phone', assumed_time: null }
    : { id, user_id, shift_id, kind, server_time, location_status: 'ok', lat: loc[0], lng: loc[1], accuracy_m: loc[2], distance_m: loc[3], source: 'phone', assumed_time: null }

/** A clock-out made by the scheduled job: no location, and its time is the end it assumed. */
const auto = (id: string, user_id: string, shift_id: string | null, server_time: string, assumed_time: string): ClockEvent => ({
  id, user_id, shift_id, kind: 'out', server_time, location_status: 'unavailable', lat: null, lng: null, accuracy_m: null, distance_m: null, source: 'auto', assumed_time,
})

export const clockEvents: ClockEvent[] = [
  e('ce-01', JOSH, shiftId('2026-10-26', 'morning'), 'in', '2026-10-26T07:00:00+11:00', [-33.78065, 151.12151, 10, 35]),
  e('ce-02', JOSH, shiftId('2026-10-26', 'morning'), 'out', '2026-10-26T13:40:00+11:00', [-33.80220, 151.07526, 18, 6200]),
  e('ce-03', GINO, shiftId('2026-10-26', 'night'), 'in', '2026-10-26T19:22:00+11:00', [-33.78085, 151.12166, 15, 55]),
  e('ce-04', GINO, shiftId('2026-10-26', 'night'), 'out', '2026-10-26T22:42:00+11:00', [-33.78078, 151.12158, 12, 48]),
  e('ce-05', KYLE, shiftId('2026-10-27', 'morning'), 'in', '2026-10-27T07:03:00+11:00', [-33.78415, 151.11851, 25, 420]),
  auto('ce-06', KYLE, shiftId('2026-10-27', 'morning'), '2026-10-27T12:00:00+11:00', '2026-10-27T10:00:00+11:00'),
  e('ce-07', GINO, null, 'in', '2026-10-27T13:05:00+11:00', [-33.78090, 151.12171, 20, 60]),
  e('ce-08', GINO, null, 'out', '2026-10-27T14:10:00+11:00', [-33.78081, 151.12163, 14, 52]),
  e('ce-09', ANGEL, shiftId('2026-10-27', 'night'), 'in', '2026-10-27T18:59:00+11:00', [-33.78245, 151.12316, 140, 260]),
  e('ce-10', ANGEL, shiftId('2026-10-27', 'night'), 'out', '2026-10-27T22:24:00+11:00', [-33.78075, 151.12154, 10, 45]),
  e('ce-11', GLADYS, shiftId('2026-10-28', 'morning'), 'in', '2026-10-28T07:00:00+11:00', 'denied'),
  e('ce-12', GLADYS, shiftId('2026-10-28', 'morning'), 'out', '2026-10-28T09:58:00+11:00', [-33.78069, 151.12149, 9, 38]),
  e('ce-13', ANGEL, null, 'in', '2026-10-26T15:10:00+11:00', [-33.81370, 151.10056, 8, 4172]),
  e('ce-14', ANGEL, null, 'out', '2026-10-26T15:12:00+11:00', [-33.81370, 151.10056, 8, 4172]),
  e('ce-15', KYLE, null, 'in', '2026-10-28T13:20:00+11:00', [-33.79600, 151.14286, 10, 2638]),
  e('ce-16', KYLE, null, 'out', '2026-10-28T13:31:00+11:00', [-33.79600, 151.14286, 10, 2638]),
]
