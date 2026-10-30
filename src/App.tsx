import { useEffect, useState } from 'react'
import { getCurrentUser, getDataMode, getPermissions, isSignedIn, setMockCurrentUser, signOut as endSession, startDataLayer, type DataMode } from '@/data'
import type { RoleId, Uuid } from '@/types'
import { DemoLogin } from '@/pages/DemoLogin'
import { CleanerHome } from '@/pages/CleanerHome'
import { ManagerDashboard } from '@/pages/ManagerDashboard'
import { RosterPage } from '@/pages/RosterPage'
import { StaffPage } from '@/pages/StaffPage'
import { DevSwitcher } from '@/components/dev/DevSwitcher'

type View = 'home' | 'roster' | 'staff'

function App() {
  // Demo mode opens on the demo login every load. Trial mode keeps data and sign-in on this phone.
  const [ready, setReady] = useState<'starting' | 'ok' | 'offline'>('starting')
  const [mode, setMode] = useState<DataMode | null>(null)
  const [signedIn, setSignedIn] = useState(false)
  // Remount the screen when sign-in or the dev switcher changes person, time or location.
  const [devKey, setDevKey] = useState(0)
  const [role, setRole] = useState<RoleId | null>(null)
  // Carly, and Gladys on her behalf, can open the roster. UI convenience only; src/data checks it too.
  const [canRoster, setCanRoster] = useState(false)
  const [view, setView] = useState<View>('home')

  // Trial mode reads the time from the server before anything shows, so no screen uses the phone's clock.
  async function start() {
    setReady('starting')
    try {
      await startDataLayer()
      setMode(await getDataMode())
      setSignedIn(await isSignedIn())
      setReady('ok')
    } catch {
      setReady('offline')
    }
  }

  useEffect(() => {
    void start()
  }, [])

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

  const signOut = () => {
    void endSession()
    setSignedIn(false)
  }
  const openRoster = canRoster ? () => setView('roster') : undefined

  if (ready === 'starting') return <main className="min-h-svh" aria-busy role="status" aria-label="Loading" />
  if (ready === 'offline') {
    return (
      <main className="mx-auto flex min-h-svh max-w-[480px] flex-col justify-center px-5 text-center">
        <p className="text-lg font-semibold">We can't reach GymShift.</p>
        <p className="mt-1 text-[15px] text-muted-foreground">Check your internet and try again. Nothing was saved or changed.</p>
        <button type="button" onClick={() => void start()} className="mt-5 h-12 rounded-[14px] border border-border px-6 font-medium active:bg-muted">
          Try again
        </button>
      </main>
    )
  }
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
      {import.meta.env.DEV && mode === 'demo' && <DevSwitcher onChange={() => setDevKey((k) => k + 1)} />}
    </>
  )
}

export default App
