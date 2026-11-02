import type { Flag } from '@/types'
import { GLADYS, CARLY, ANGEL, JOSH, KYLE, GINO, shiftId } from './ids'

// One of every flag kind. Flags created at event time from the raw record; resolving never edits the record.
export const flags: Flag[] = [
  // Josh 26 Oct morning — all three resolved together when Carly logged correction-01.
  {
    id: 'flag-01', kind: 'missing_clock_out', user_id: JOSH, shift_id: shiftId('2026-10-26', 'morning'), clock_event_id: null,
    detail: 'No clock-out by 10:30 am', created_at: '2026-10-26T10:30:00+11:00',
    resolved_at: '2026-10-26T14:05:00+11:00', resolved_by: CARLY,
  },
  {
    id: 'flag-02', kind: 'off_site', user_id: JOSH, shift_id: shiftId('2026-10-26', 'morning'), clock_event_id: 'ce-02',
    detail: 'Clock-out 6.2 km from gym (±18 m)', created_at: '2026-10-26T13:40:00+11:00',
    resolved_at: '2026-10-26T14:05:00+11:00', resolved_by: CARLY,
  },
  {
    id: 'flag-03', kind: 'over_without_extension', user_id: JOSH, shift_id: shiftId('2026-10-26', 'morning'), clock_event_id: 'ce-02',
    detail: 'Recorded 6h 40m with no approved extension (standard 3h)', created_at: '2026-10-26T13:40:00+11:00',
    resolved_at: '2026-10-26T14:05:00+11:00', resolved_by: CARLY,
  },
  // Gino 26 Oct night
  {
    id: 'flag-04', kind: 'no_show', user_id: GINO, shift_id: shiftId('2026-10-26', 'night'), clock_event_id: null,
    detail: 'No clock-in by 7:15 pm', created_at: '2026-10-26T19:15:00+11:00',
    resolved_at: '2026-10-27T08:30:00+11:00', resolved_by: CARLY,
  },
  {
    id: 'flag-05', kind: 'over_without_extension', user_id: GINO, shift_id: shiftId('2026-10-26', 'night'), clock_event_id: 'ce-04',
    detail: 'Recorded 3h 20m with no approved extension (standard 3h)', created_at: '2026-10-26T22:42:00+11:00',
    resolved_at: null, resolved_by: null,
  },
  // Open flags for the dashboard
  {
    id: 'flag-06', kind: 'off_site', user_id: KYLE, shift_id: shiftId('2026-10-27', 'morning'), clock_event_id: 'ce-05',
    detail: 'Clock-in 420 m from gym (±25 m)', created_at: '2026-10-27T07:03:00+11:00',
    resolved_at: null, resolved_by: null,
  },
  {
    id: 'flag-07', kind: 'unscheduled', user_id: GINO, shift_id: null, clock_event_id: 'ce-07',
    detail: 'Clock-in with no rostered shift', created_at: '2026-10-27T13:05:00+11:00',
    resolved_at: null, resolved_by: null,
  },
  {
    id: 'flag-08', kind: 'no_location', user_id: GLADYS, shift_id: shiftId('2026-10-28', 'morning'), clock_event_id: 'ce-11',
    detail: 'Location permission denied at clock-in', created_at: '2026-10-28T07:00:00+11:00',
    resolved_at: null, resolved_by: null,
  },
  // Kyle 27 Oct morning: never clocked out (closed automatically at noon, ce-06).
  {
    id: 'flag-09', kind: 'missing_clock_out', user_id: KYLE, shift_id: shiftId('2026-10-27', 'morning'), clock_event_id: 'ce-05',
    detail: 'No clock-out by 10:30 am', created_at: '2026-10-27T10:30:00+11:00',
    resolved_at: null, resolved_by: null,
  },
  // Angel 26 Oct, the clock-in from home: resolved when Carly voided it.
  {
    id: 'flag-10', kind: 'unscheduled', user_id: ANGEL, shift_id: null, clock_event_id: 'ce-13',
    detail: 'Clock-in with no rostered shift', created_at: '2026-10-26T15:10:00+11:00',
    resolved_at: '2026-10-26T16:00:00+11:00', resolved_by: CARLY,
  },
  {
    id: 'flag-11', kind: 'off_site', user_id: ANGEL, shift_id: null, clock_event_id: 'ce-13',
    detail: 'Clock-in 4172 m from gym (±8 m)', created_at: '2026-10-26T15:10:00+11:00',
    resolved_at: '2026-10-26T16:00:00+11:00', resolved_by: CARLY,
  },
  {
    id: 'flag-12', kind: 'short_session', user_id: ANGEL, shift_id: null, clock_event_id: 'ce-14',
    detail: 'Clocked out 2 min after clocking in', created_at: '2026-10-26T15:12:00+11:00',
    resolved_at: '2026-10-26T16:00:00+11:00', resolved_by: CARLY,
  },
  // Kyle 28 Oct, the tap at home he asked to remove (creq-01): open until Carly decides.
  {
    id: 'flag-13', kind: 'unscheduled', user_id: KYLE, shift_id: null, clock_event_id: 'ce-15',
    detail: 'Clock-in with no rostered shift', created_at: '2026-10-28T13:20:00+11:00',
    resolved_at: null, resolved_by: null,
  },
  {
    id: 'flag-14', kind: 'off_site', user_id: KYLE, shift_id: null, clock_event_id: 'ce-15',
    detail: 'Clock-in 2638 m from gym (±10 m)', created_at: '2026-10-28T13:20:00+11:00',
    resolved_at: null, resolved_by: null,
  },
]
