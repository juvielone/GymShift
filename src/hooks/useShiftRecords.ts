// Past shifts for the records screen, one fortnight (the roster and pay period) at a time, back as
// far as records are kept. What a viewer sees is limited in src/data by their role; the person
// filter is applied here so the picker can show each person's count for the fortnight.
import { useCallback, useEffect, useState } from 'react'
import { getCurrentUser, getPermissions, getRecordPeople, getSettings, getShiftRecords, refreshData, serverNow, type ShiftRecord } from '@/data'
import type { Scope, SiteSettings, Timestamp, User } from '@/types'
import { addDays, fortnightStartOf, localDate, recordsOldestDate } from '@/lib/rules'

export interface RecordsData {
  me: User
  settings: SiteSettings
  now: Timestamp
  today: string
  /** Fortnight starts that still hold records, newest (the current one) first. */
  fortnights: string[]
  scope: Scope
  people: User[]
  /** Every visible shift in the chosen fortnight, newest first. */
  records: ShiftRecord[]
}

export function useShiftRecords() {
  const [data, setData] = useState<RecordsData | null>(null)
  const [error, setError] = useState(false)
  /** Start of the fortnight shown; null = the current one. */
  const [fortnight, setFortnight] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      await refreshData()
      const [me, settings] = await Promise.all([getCurrentUser(), getSettings()])
      const now = serverNow()
      const today = localDate(now, settings)
      const current = fortnightStartOf(today, settings)
      const oldest = fortnightStartOf(recordsOldestDate(today, settings), settings)
      const fortnights: string[] = []
      for (let f = current; f >= oldest; f = addDays(f, -14)) fortnights.push(f)
      const from = fortnight ?? current
      const to = addDays(from, 13) < today ? addDays(from, 13) : today
      const [role, people, records] = await Promise.all([
        getPermissions(me.id),
        getRecordPeople(me.id),
        getShiftRecords({ viewerId: me.id, from, to }),
      ])
      setData({ me, settings, now, today, fortnights, scope: role.view_records_scope, people, records })
      setError(false)
    } catch {
      setError(true)
    }
  }, [fortnight])

  useEffect(() => {
    void load()
  }, [load])

  return { data, error, reload: load, fortnight, setFortnight }
}
