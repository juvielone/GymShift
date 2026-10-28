// Development only (rendered behind import.meta.env.DEV): switch person, mock server time and
// fake location so every home-screen state can be checked. Never part of the production app.
import { useEffect, useState } from 'react'
import { getCurrentUser, getSettings, getUsers, setMockCurrentUser, setMockNow } from '@/data'
import type { User } from '@/types'
import { setDevLocationMode, type DevLocationMode } from '@/lib/geolocation'

const TIMES: { label: string; ts: string }[] = [
  { label: 'Wed 28 Oct · 6:30 pm', ts: '2026-10-28T18:30:00+11:00' },
  { label: 'Wed 28 Oct · 7:40 pm', ts: '2026-10-28T19:40:00+11:00' },
  { label: 'Wed 28 Oct · 10:15 pm', ts: '2026-10-28T22:15:00+11:00' },
  { label: 'Thu 29 Oct · 12:00 pm', ts: '2026-10-29T12:00:00+11:00' },
  { label: 'Sat 31 Oct · 6:50 am', ts: '2026-10-31T06:50:00+11:00' },
]

const LOCATIONS: { value: DevLocationMode; label: string }[] = [
  { value: 'real', label: 'Real GPS' },
  { value: 'gym', label: 'At the gym' },
  { value: 'away', label: 'Away (1 km)' },
  { value: 'denied', label: 'Permission denied' },
  { value: 'timeout', label: 'Timed out' },
  { value: 'unavailable', label: 'Unavailable' },
]

export function DevSwitcher({ onChange }: { onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [userId, setUserId] = useState('')
  const [time, setTime] = useState(TIMES[1].ts)
  const [loc, setLoc] = useState<DevLocationMode>('gym')

  useEffect(() => {
    void (async () => {
      const [all, me, settings] = await Promise.all([getUsers({ activeOnly: true }), getCurrentUser(), getSettings()])
      setUsers(all)
      setUserId(me.id)
      setDevLocationMode('gym', { lat: settings.gym_lat, lng: settings.gym_lng })
    })()
  }, [])

  async function apply(next: { userId?: string; time?: string; loc?: DevLocationMode }) {
    const settings = await getSettings()
    if (next.userId) {
      await setMockCurrentUser(next.userId)
      setUserId(next.userId)
    }
    if (next.time) {
      setMockNow(next.time)
      setTime(next.time)
    }
    if (next.loc) {
      setDevLocationMode(next.loc, { lat: settings.gym_lat, lng: settings.gym_lng })
      setLoc(next.loc)
    }
    onChange()
  }

  const select = 'h-10 w-full rounded-lg border border-border bg-background px-2 text-sm'

  return (
    <div className="fixed right-3 bottom-28 z-40 flex flex-col-reverse items-end gap-2 text-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} className="block rounded-full bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white shadow">
        {open ? 'Close dev' : 'Dev'}
      </button>
      {open && (
        <div className="w-64 space-y-3 rounded-xl border border-border bg-background p-3 shadow-lg">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Signed in as</span>
            <select className={select} value={userId} onChange={(e) => void apply({ userId: e.target.value })}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role.replace('_', ' ')})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Server time</span>
            <select className={select} value={time} onChange={(e) => void apply({ time: e.target.value })}>
              {TIMES.map((t) => (
                <option key={t.ts} value={t.ts}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Next location fix</span>
            <select className={select} value={loc} onChange={(e) => void apply({ loc: e.target.value as DevLocationMode })}>
              {LOCATIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">Changes made here stay until the page reloads.</p>
        </div>
      )}
    </div>
  )
}
