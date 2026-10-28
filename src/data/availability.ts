import type { Availability, DateString, Uuid } from '@/types'
import { copy, db, newId, serverNow } from './store'

export async function getAvailability(filter: { userId?: Uuid; from?: DateString; to?: DateString } = {}): Promise<Availability[]> {
  return copy(
    db.availability.filter(
      (a) =>
        (filter.userId === undefined || a.user_id === filter.userId) &&
        (filter.from === undefined || a.date >= filter.from) &&
        (filter.to === undefined || a.date <= filter.to),
    ),
  )
}

export async function markUnavailable(input: { userId: Uuid; date: DateString; note?: string }): Promise<Availability> {
  const existing = db.availability.find((a) => a.user_id === input.userId && a.date === input.date)
  if (existing) return copy(existing)
  const row: Availability = { id: newId('avail'), user_id: input.userId, date: input.date, note: input.note ?? null, created_at: serverNow() }
  db.availability.push(row)
  return copy(row)
}
