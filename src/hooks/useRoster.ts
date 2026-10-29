// Everything the roster screen shows for one fortnight, loaded through '@/data'. Server time only.
import { useCallback, useEffect, useState } from 'react'
import { getAvailability, getCurrentUser, getRosterWarnings, getSettings, getShiftChangesForFortnight, getShifts, getUsers, serverNow } from '@/data'
import type { RosterWarning } from '@/data'
import type { Availability, DateString, Shift, ShiftChange, SiteSettings, Timestamp, User } from '@/types'
import { addDays, fortnightStartOf, localDate } from '@/lib/rules'

export interface Roster {
  me: User
  settings: SiteSettings
  now: Timestamp
  start: DateString
  /** Everyone who can be put on a shift: active staff other than the manager. */
  staff: User[]
  /** Everyone, for names in the change history. */
  users: User[]
  /** Drafts and published shifts of the fortnight (cancelled ones are listed separately). */
  shifts: Shift[]
  cancelled: Shift[]
  warnings: RosterWarning[]
  availability: Availability[]
  changes: ShiftChange[]
  /** Shifts in the fortnight before, for "copy last fortnight". */
  previousCount: number
}

async function load(start: DateString): Promise<Roster> {
  const [me, settings] = await Promise.all([getCurrentUser(), getSettings()])
  const end = addDays(start, 13)
  const [users, all, previous, warnings, availability, changes] = await Promise.all([
    getUsers(),
    getShifts({ fortnightStart: start }),
    getShifts({ fortnightStart: addDays(start, -14) }),
    getRosterWarnings(start),
    getAvailability({ from: start, to: end }),
    getShiftChangesForFortnight(start),
  ])
  return {
    me,
    settings,
    now: serverNow(),
    start,
    staff: users.filter((u) => u.active && u.role !== 'manager').sort((a, b) => a.full_name.localeCompare(b.full_name)),
    users,
    shifts: all.filter((s) => s.status !== 'cancelled'),
    cancelled: all.filter((s) => s.status === 'cancelled'),
    warnings,
    availability,
    changes,
    previousCount: previous.filter((s) => s.status !== 'cancelled').length,
  }
}

/** The fortnight to open on: the first from today on that still has drafts, else the current one. */
export async function initialFortnight(): Promise<DateString> {
  const settings = await getSettings()
  const current = fortnightStartOf(localDate(serverNow(), settings), settings)
  const drafts = await getShifts({ status: 'draft', from: current })
  return drafts[0]?.fortnight_start ?? current
}

export function useRoster(start: DateString | null) {
  const [data, setData] = useState<Roster | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!start) return
    try {
      setData(await load(start))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }, [start])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { data, error, refresh }
}
