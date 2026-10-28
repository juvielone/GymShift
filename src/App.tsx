import { useState } from 'react'
import { CleanerHome } from '@/pages/CleanerHome'
import { DevSwitcher } from '@/components/dev/DevSwitcher'

function App() {
  // Remount the screen when the dev switcher changes person, time or location.
  const [devKey, setDevKey] = useState(0)
  return (
    <>
      <CleanerHome key={devKey} />
      {import.meta.env.DEV && <DevSwitcher onChange={() => setDevKey((k) => k + 1)} />}
    </>
  )
}

export default App
