import { useEffect, useState } from 'react'
import { getCurrentUser } from '@/data'
import type { RoleId } from '@/types'
import { CleanerHome } from '@/pages/CleanerHome'
import { ManagerDashboard } from '@/pages/ManagerDashboard'
import { DevSwitcher } from '@/components/dev/DevSwitcher'

function App() {
  // Remount the screen when the dev switcher changes person, time or location.
  const [devKey, setDevKey] = useState(0)
  const [role, setRole] = useState<RoleId | null>(null)

  // The manager opens on the dashboard; cleaners and the team lead open on their shift home.
  useEffect(() => {
    void getCurrentUser().then((u) => setRole(u.role))
  }, [devKey])

  return (
    <>
      {role === 'manager' ? <ManagerDashboard key={devKey} /> : role && <CleanerHome key={devKey} />}
      {import.meta.env.DEV && <DevSwitcher onChange={() => setDevKey((k) => k + 1)} />}
    </>
  )
}

export default App
