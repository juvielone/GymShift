// Swaps and covers on a cleaner's home (PRD F3): what each upcoming shift says about a hand-off, what
// colleagues are asking of this person, and their days off next fortnight. Reads only through '@/data'.
import { useCallback, useEffect, useState } from 'react'
import { getAvailability, getShifts, getSwapCandidates, getSwaps, getUsers } from '@/data'
import type { DateString, Shift, SiteSettings, Swap, Timestamp, User } from '@/types'
import { addDays, compareTs, fortnightStartOf, localDate, shiftStartAt } from '@/lib/rules'

/** Where a hand-off of one of my shifts is up to. */
export type MyHandoff =
  | { kind: 'waiting'; swap: Swap; asked: User | null }
  | { kind: 'agreed'; swap: Swap; taker: User }
  | { kind: 'said_no'; swap: Swap; by: User }
  | { kind: 'kept'; swap: Swap }

/** A colleague's shift I could take: asked by name, or open to anyone free. */
export interface Ask {
  swap: Swap
  shift: Shift
  requester: User
  /** I already said yes: waiting for Carly or Gladys. */
  agreed: boolean
}

export interface Handoffs {
  mine: Map<string, MyHandoff>
  asks: Ask[]
  daysOff: { from: DateString; to: DateString; dates: DateString[]; note: string | null }
}

export function useHandoffs(user: User, settings: SiteSettings, now: Timestamp, upcoming: Shift[]) {
  const [data, setData] = useState<Handoffs | null>(null)

  const load = useCallback(async () => {
    const today = localDate(now, settings)
    const next = addDays(fortnightStartOf(today, settings), 14)
    const [swaps, users, shifts, away] = await Promise.all([
      getSwaps(),
      getUsers({ activeOnly: true }),
      getShifts({ status: 'published', from: today }),
      getAvailability({ userId: user.id, from: next, to: addDays(next, 13) }),
    ])
    const person = new Map(users.map((u) => [u.id, u]))
    const shiftById = new Map(shifts.map((s) => [s.id, s]))
    const ahead = (s: Shift) => compareTs(shiftStartAt(s, settings), now) > 0

    // Newest request on each of my upcoming shifts that I asked (getSwaps is newest first).
    const mine = new Map<string, MyHandoff>()
    for (const shift of upcoming) {
      const swap = swaps.find((w) => w.shift_id === shift.id && w.requested_by === user.id)
      if (!swap || swap.status === 'withdrawn' || swap.status === 'approved') continue
      if (swap.status === 'pending') {
        const taker = swap.covered_by ? person.get(swap.covered_by) : undefined
        mine.set(shift.id, taker ? { kind: 'agreed', swap, taker } : { kind: 'waiting', swap, asked: swap.target_user_id ? (person.get(swap.target_user_id) ?? null) : null })
      } else if (swap.decided_by === swap.target_user_id && person.get(swap.decided_by!)) {
        mine.set(shift.id, { kind: 'said_no', swap, by: person.get(swap.decided_by!)! })
      } else {
        mine.set(shift.id, { kind: 'kept', swap })
      }
    }

    const asks: Ask[] = []
    for (const swap of swaps) {
      const shift = shiftById.get(swap.shift_id)
      const requester = person.get(swap.requested_by)
      if (swap.status !== 'pending' || !shift || !requester || swap.requested_by === user.id || !ahead(shift)) continue
      if (shift.assigned_user_id !== swap.requested_by) continue
      if (swap.covered_by) {
        if (swap.covered_by === user.id) asks.push({ swap, shift, requester, agreed: true })
        continue
      }
      if (swap.kind === 'swap' ? swap.target_user_id === user.id : (await getSwapCandidates(shift.id)).some((u) => u.id === user.id)) {
        asks.push({ swap, shift, requester, agreed: false })
      }
    }
    asks.sort((a, b) => compareTs(shiftStartAt(a.shift, settings), shiftStartAt(b.shift, settings)))

    setData({ mine, asks, daysOff: { from: next, to: addDays(next, 13), dates: away.map((a) => a.date), note: away[0]?.note ?? null } })
  }, [user.id, settings, now, upcoming])

  useEffect(() => {
    void load()
  }, [load])

  return { data, reload: load }
}
