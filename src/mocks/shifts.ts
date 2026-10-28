import type { Shift, ShiftChange, ShiftType } from '@/types'
import { ANA, CARLY, FORTNIGHT_START, GLADYS, LINH, MARIA, PRIYA, TOMAS, shiftId } from './ids'

// Published fortnight Mon 26 Oct – Sun 8 Nov 2026: [date, morning cleaner, night cleaner].
// Respects availability (Priya 31 Oct & 1 Nov, Tomas 4 Nov, Ana 7 Nov).
const roster: [string, string, string][] = [
  ['2026-10-26', MARIA, TOMAS],
  ['2026-10-27', PRIYA, LINH], // night: Ana released for cover, Linh picked it up (swap-01)
  ['2026-10-28', ANA, MARIA],
  ['2026-10-29', TOMAS, PRIYA],
  ['2026-10-30', LINH, ANA],
  ['2026-10-31', MARIA, TOMAS],
  ['2026-11-01', ANA, LINH],
  ['2026-11-02', PRIYA, MARIA],
  ['2026-11-03', TOMAS, ANA],
  ['2026-11-04', LINH, PRIYA],
  ['2026-11-05', MARIA, ANA], // night moved to 19:30 (shift-change-02/03)
  ['2026-11-06', PRIYA, TOMAS],
  ['2026-11-07', LINH, MARIA],
  ['2026-11-08', TOMAS, PRIYA],
]

const gladysGroup = new Set([MARIA, PRIYA, TOMAS])
const timeOverrides: Record<string, [string, string]> = {
  [shiftId('2026-11-05', 'night')]: ['19:30', '22:30'],
}

function makeShift(date: string, type: ShiftType, userId: string): Shift {
  const id = shiftId(date, type)
  const [start_time, end_time] = timeOverrides[id] ?? (type === 'morning' ? ['07:00', '10:00'] : ['19:00', '22:00'])
  // Authorship only: Gladys drafted her group's shifts, Carly the rest (both may roster anyone).
  const author = gladysGroup.has(userId) ? GLADYS : CARLY
  return {
    id,
    date,
    type,
    start_time,
    end_time,
    assigned_user_id: userId,
    status: 'published',
    fortnight_start: FORTNIGHT_START,
    created_by: author,
    created_at: '2026-10-22T15:00:00+11:00',
    published_at: '2026-10-23T17:30:00+11:00',
  }
}

export const shifts: Shift[] = [
  ...roster.flatMap(([date, morning, night]) => [makeShift(date, 'morning', morning), makeShift(date, 'night', night)]),
  // Next fortnight, still being drafted — staff can't see it yet.
  {
    id: shiftId('2026-11-09', 'morning'),
    date: '2026-11-09',
    type: 'morning',
    start_time: '07:00',
    end_time: '10:00',
    assigned_user_id: MARIA,
    status: 'draft',
    fortnight_start: '2026-11-09',
    created_by: GLADYS,
    created_at: '2026-10-28T10:15:00+11:00',
    published_at: null,
  },
]

export const shiftChanges: ShiftChange[] = [
  {
    id: 'shift-change-01',
    shift_id: shiftId('2026-10-27', 'night'),
    field: 'assigned_user_id',
    old_value: ANA,
    new_value: LINH,
    changed_by: CARLY,
    changed_at: '2026-10-25T16:20:00+11:00',
    swap_id: 'swap-01',
  },
  {
    id: 'shift-change-02',
    shift_id: shiftId('2026-11-05', 'night'),
    field: 'start_time',
    old_value: '19:00',
    new_value: '19:30',
    changed_by: CARLY,
    changed_at: '2026-10-27T10:00:00+11:00',
    swap_id: null,
  },
  {
    id: 'shift-change-03',
    shift_id: shiftId('2026-11-05', 'night'),
    field: 'end_time',
    old_value: '22:00',
    new_value: '22:30',
    changed_by: CARLY,
    changed_at: '2026-10-27T10:00:00+11:00',
    swap_id: null,
  },
]
