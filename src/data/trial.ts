// Starting the data layer, and the trial-mode controls. With Supabase, start() becomes the auth
// session check and the trial helpers go away.
import { clearFiles } from './photoFiles'
import { clearSaved, MODE, syncServerClock, type DataMode } from './store'

export type { DataMode }

export async function getDataMode(): Promise<DataMode> {
  return MODE
}

/** Call once before showing any screen. Trial mode reads the server time first; throws when offline. */
export async function startDataLayer(): Promise<void> {
  await syncServerClock()
}

/** Trial mode: wipe everything saved on this phone (records and photos) and start from the seed. */
export async function resetTrialData(): Promise<void> {
  clearSaved()
  await clearFiles().catch(() => {})
  location.reload()
}
