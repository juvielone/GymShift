import { useEffect, useState } from 'react'
import { getCurrentUser, getPermissions, setMockCurrentUser } from '@/data'
import type { RoleId, Uuid } from '@/types'
import { DemoLogin } from '@/pages/DemoLogin'
import { CleanerHome } from '@/pages/CleanerHome'
import { ManagerDashboard } from '@/pages/ManagerDashboard'
import { RosterPage } from '@/pages/RosterPage'
import { StaffPage } from '@/pages/StaffPage'
import { DevSwitcher } from '@/components/dev/DevSwitcher'

type View = 'home' | 'roster' | 'staff'

function App() {
  // Every load opens on the demo login; the mock store resets on reload too.
  const [signedIn, setSignedIn] = useState(false)
  // Remount the screen when sign-in or the dev switcher changes person, time or location.
  const [devKey, setDevKey] = useState(0)
  const [role, setRole] = useState<RoleId | null>(null)
  // Carly, and Gladys on her behalf, can open the roster. UI convenience only; src/data checks it too.
  const [canRoster, setCanRoster] = useState(false)
  const [view, setView] = useState<View>('home')

  // The manager opens on the dashboard; cleaners and the team lead open on their shift home.
  useEffect(() => {
    if (!signedIn) return
    void getCurrentUser().then(async (u) => {
      setRole(u.role)
      setCanRoster((await getPermissions(u.id)).can_publish_roster !== false)
    })
  }, [signedIn, devKey])

  async function signIn(id: Uuid) {
    await setMockCurrentUser(id)
    setRole(null)
    setView('home')
    setSignedIn(true)
    setDevKey((k) => k + 1)
  }

  const signOut = () => setSignedIn(false)
  const openRoster = canRoster ? () => setView('roster') : undefined

  if (!signedIn) return <DemoLogin onSignIn={(id) => void signIn(id)} />

  return (
    <>
      {view === 'roster' && canRoster ? (
        <RosterPage key={devKey} onBack={() => setView('home')} />
      ) : view === 'staff' && role === 'manager' ? (
        <StaffPage key={devKey} onBack={() => setView('home')} />
      ) : role === 'manager' ? (
        <ManagerDashboard key={devKey} onSignOut={signOut} onOpenRoster={openRoster} onOpenStaff={() => setView('staff')} />
      ) : (
        role && <CleanerHome key={devKey} onSignOut={signOut} onOpenRoster={openRoster} />
      )}
      {import.meta.env.DEV && <DevSwitcher onChange={() => setDevKey((k) => k + 1)} />}
    </>
  )
}

export default App
