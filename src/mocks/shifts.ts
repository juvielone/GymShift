import type { Shift, ShiftChange, ShiftType } from '@/types'
import { CARLY, FORTNIGHT_START, GLADYS, ANGEL, JOSH, KYLE, GINO, shiftId } from './ids'

// Published fortnight Mon 2 Nov – Sun 15 Nov 2026: [date, morning cleaner, night cleaner].
// Respects availability (Kyle 7 Nov & 8 Nov, Gino 11 Nov, Gladys 14 Nov).
const roster: [string, string, string][] = [
  ['2026-11-02', JOSH, GINO],
  ['2026-11-03', KYLE, ANGEL], // night: Gladys released for cover, Angel picked it up (swap-01)
  ['2026-11-04', GLADYS, JOSH],
  ['2026-11-05', GINO, KYLE],
  ['2026-11-06', ANGEL, GLADYS],
  ['2026-11-07', JOSH, GINO],
  ['2026-11-08', GLADYS, ANGEL],
  ['2026-11-09', KYLE, JOSH],
  ['2026-11-10', GINO, GLADYS],
  ['2026-11-11', ANGEL, KYLE],
  ['2026-11-12', JOSH, GLADYS], // night moved to 19:30 (shift-change-02/03)
  ['2026-11-13', KYLE, GINO],
  ['2026-11-14', ANGEL, JOSH],
  ['2026-11-15', GINO, KYLE],
]

const gladysGroup = new Set([JOSH, KYLE, GINO])
const timeOverrides: Record<string, [string, string]> = {
  [shiftId('2026-11-12', 'night')]: ['19:30', '22:30'],
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
    created_at: '2026-10-29T15:00:00+11:00',
    published_at: '2026-10-30T17:30:00+11:00',
  }
}

// Next fortnight, still being drafted — staff can't see it yet.
const draft = (date: string, type: ShiftType, userId: string): Shift => ({
  id: shiftId(date, type),
  date,
  type,
  start_time: type === 'morning' ? '07:00' : '19:00',
  end_time: type === 'morning' ? '10:00' : '22:00',
  assigned_user_id: userId,
  status: 'draft',
  fortnight_start: '2026-11-16',
  created_by: GLADYS,
  created_at: '2026-11-04T10:15:00+11:00',
  published_at: null,
})

export const shifts: Shift[] = [
  ...roster.flatMap(([date, morning, night]) => [makeShift(date, 'morning', morning), makeShift(date, 'night', night)]),
  draft('2026-11-16', 'morning', JOSH),
  draft('2026-11-16', 'night', GINO),
  draft('2026-11-17', 'morning', KYLE),
]

export const shiftChanges: ShiftChange[] = [
  {
    id: 'shift-change-01',
    shift_id: shiftId('2026-11-03', 'night'),
    field: 'assigned_user_id',
    old_value: GLADYS,
    new_value: ANGEL,
    changed_by: CARLY,
    changed_at: '2026-11-01T16:20:00+11:00',
    swap_id: 'swap-01',
  },
  {
    id: 'shift-change-02',
    shift_id: shiftId('2026-11-12', 'night'),
    field: 'start_time',
    old_value: '19:00',
    new_value: '19:30',
    changed_by: CARLY,
    changed_at: '2026-11-03T10:00:00+11:00',
    swap_id: null,
  },
  {
    id: 'shift-change-03',
    shift_id: shiftId('2026-11-12', 'night'),
    field: 'end_time',
    old_value: '22:00',
    new_value: '22:30',
    changed_by: CARLY,
    changed_at: '2026-11-03T10:00:00+11:00',
    swap_id: null,
  },
]
