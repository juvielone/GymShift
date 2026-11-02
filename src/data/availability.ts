// Days off (PRD F3). Mirrors set_days_off in 15_swaps.sql: a person sets their own days off in a range,
// from tomorrow on; today and past days stay as they are. Rosterers see them as roster warnings.
import type { Availability, DateString, Uuid } from '@/types'
import { copy, db, newId, requireUser, serverNow } from './store'
import { addDays, localDate } from '@/lib/rules'

export async function getAvailability(filter: { userId?: Uuid; from?: DateString; to?: DateString } = {}): Promise<Availability[]> {
  return copy(
    db.availability
      .filter(
        (a) =>
          (filter.userId === undefined || a.user_id === filter.userId) &&
          (filter.from === undefined || a.date >= filter.from) &&
          (filter.to === undefined || a.date <= filter.to),
      )
      .sort((a, b) => a.date.localeCompare(b.date)),
  )
}

/** Sets the person's days off between `from` and `to` to exactly `dates`, with one optional note. */
export async function setDaysOff(input: { userId: Uuid; from: DateString; to: DateString; dates: DateString[]; note?: string | null }): Promise<Availability[]> {
  if (!requireUser(input.userId).active) throw new Error('Sign in first')
  const today = localDate(serverNow(), db.settings)
  if (input.from > input.to || input.to > addDays(input.from, 31)) throw new Error('Pick days within one month')
  if (input.dates.some((d) => d < input.from || d > input.to || d <= today)) throw new Error('Pick days from tomorrow on')
  const note = input.note?.trim() || null
  const keepFrom = input.from > today ? input.from : addDays(today, 1)
  db.availability = db.availability.filter(
    (a) => a.user_id !== input.userId || a.date < keepFrom || a.date > input.to || input.dates.includes(a.date),
  )
  for (const date of input.dates) {
    const existing = db.availability.find((a) => a.user_id === input.userId && a.date === date)
    if (existing) existing.note = note
    else db.availability.push({ id: newId('avail'), user_id: input.userId, date, note, created_at: serverNow() })
  }
  return getAvailability({ userId: input.userId, from: input.from, to: input.to })
}
