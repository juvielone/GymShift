import { useEffect, useState } from 'react'
import { getCurrentUser, setMockCurrentUser } from '@/data'
import type { RoleId, Uuid } from '@/types'
import { DemoLogin } from '@/pages/DemoLogin'
import { CleanerHome } from '@/pages/CleanerHome'
import { ManagerDashboard } from '@/pages/ManagerDashboard'
import { DevSwitcher } from '@/components/dev/DevSwitcher'

function App() {
  // Every load opens on the demo login; the mock store resets on reload too.
  const [signedIn, setSignedIn] = useState(false)
  // Remount the screen when sign-in or the dev switcher changes person, time or location.
  const [devKey, setDevKey] = useState(0)
  const [role, setRole] = useState<RoleId | null>(null)

  // The manager opens on the dashboard; cleaners and the team lead open on their shift home.
  useEffect(() => {
    if (signedIn) void getCurrentUser().then((u) => setRole(u.role))
  }, [signedIn, devKey])

  async function signIn(id: Uuid) {
    await setMockCurrentUser(id)
    setRole(null)
    setSignedIn(true)
    setDevKey((k) => k + 1)
  }

  const signOut = () => setSignedIn(false)

  if (!signedIn) return <DemoLogin onSignIn={(id) => void signIn(id)} />

  return (
    <>
      {role === 'manager' ? (
        <ManagerDashboard key={devKey} onSignOut={signOut} />
      ) : (
        role && <CleanerHome key={devKey} onSignOut={signOut} />
      )}
      {import.meta.env.DEV && <DevSwitcher onChange={() => setDevKey((k) => k + 1)} />}
    </>
  )
}

export default App
