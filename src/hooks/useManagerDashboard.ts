// Everything Carly's dashboard shows, loaded through '@/data'. Server time only.
import { useCallback, useEffect, useState } from 'react'
import { getCurrentUser, getFlags, getFortnightHours, getOpenSupplyAlerts, getSettings, getShiftAttendance, getShifts, getUsers, serverNow } from '@/data'
import type { Note, SiteSettings, Timestamp, User } from '@/types'
import type { FlagView } from '@/components/manager/FlagSheet'
import type { TodayRow } from '@/components/manager/TodayPanel'
import { loadRequests, type RequestItem } from '@/hooks/requests'
import { compareTs, localDate } from '@/lib/rules'

export interface ManagerDashboard {
  me: User
  settings: SiteSettings
  now: Timestamp
  requests: RequestItem[]
  flags: FlagView[]
  supplies: { note: Note; user: User | null }[]
  today: TodayRow[]
  /** Fortnight start dates that have published shifts, oldest first, and the one containing today. */
  fortnights: string[]
  currentFortnight: string
  /** Worked minutes this fortnight across everyone (closed sessions only), for the one-line hours row. */
  fortnightMin: number
}

async function load(): Promise<ManagerDashboard> {
  const [me, settings] = await Promise.all([getCurrentUser(), getSettings()])
  const now = serverNow()
  const today = localDate(now, settings)
  const [users, shifts, flags, supplies, requests] = await Promise.all([
    getUsers(),
    getShifts({ status: 'published' }),
    getFlags({ open: true }),
    getOpenSupplyAlerts(),
    loadRequests(me, settings),
  ])
  const userById = new Map(users.map((u) => [u.id, u]))
  const shiftById = new Map(shifts.map((s) => [s.id, s]))

  const todayShifts = shifts.filter((s) => s.date === today)
  const todayRows: TodayRow[] = []
  for (const shift of todayShifts) {
    const user = userById.get(shift.assigned_user_id)
    if (user) todayRows.push({ shift, user, session: await getShiftAttendance(shift.id) })
  }

  const fortnights = [...new Set(shifts.map((s) => s.fortnight_start))].sort()
  const currentFortnight = fortnights.filter((f) => f <= today).at(-1) ?? fortnights[0] ?? today

  const fortnightMin = (await getFortnightHours(currentFortnight)).reduce((sum, r) => sum + r.total_min, 0)

  return {
    me,
    settings,
    now,
    requests,
    // Oldest first, matching requests: the longest-waiting item is handled first.
    flags: flags
      .sort((a, b) => compareTs(a.created_at, b.created_at))
      .flatMap((flag) => {
        const user = userById.get(flag.user_id)
        return user ? [{ flag, user, shift: flag.shift_id ? (shiftById.get(flag.shift_id) ?? null) : null }] : []
      }),
    supplies: supplies.sort((a, b) => compareTs(a.created_at, b.created_at)).map((note) => ({ note, user: userById.get(note.user_id) ?? null })),
    today: todayRows,
    fortnights,
    currentFortnight,
    fortnightMin,
  }
}

/** Refreshes every 30 s so Today keeps up with clock-ins. */
export function useManagerDashboard() {
  const [data, setData] = useState<ManagerDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setData(await load())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 30_000)
    return () => clearInterval(id)
  }, [refresh])

  return { data, error, refresh }
}
