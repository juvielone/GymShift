import type { SiteSettings } from '@/types'
import { copy, db } from './store'

export async function getSettings(): Promise<SiteSettings> {
  return copy(db.settings)
}
