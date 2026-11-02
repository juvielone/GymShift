// Pending requests a viewer can decide, shaped for display. Shared by Carly's dashboard and the
// Team section on a team lead's home. Reads only through '@/data'; decisions are made elsewhere.
import { getAvailability, getCorrectionRequests, getEffectiveClockEvents, getExtensions, getPermissions, getShifts, getSwaps, getUsers } from '@/data'
import type { EffectiveClockEvent } from '@/data'
import type { CorrectionRequest, Extension, Shift, SiteSettings, Swap, Timestamp, User } from '@/types'
import { approvedExtensionMinutes, canApproveExtension, compareTs } from '@/lib/rules'

export type RequestItem =
  | {
      kind: 'extension'
      id: string
      ext: Extension
      shift: Shift
      requester: User
      /** null when it can be approved; otherwise why not (shown instead of Approve). */
      blocked: string | null
      /** Asked after clocking out ("Stayed to finish"): that clock-out, with where the phone was. */
      clockedOut: EffectiveClockEvent | null
    }
  | {
      kind: 'swap'
      id: string
      swap: Swap
      shift: Shift
      requester: User
      /** Named colleague for a swap, or whoever already picked up a cover. */
      other: User | null
      /** For an open cover: cleaners free that day who could take it. */
      candidates: User[]
    }
  | {
      /** "This was a mistake" or "When did you finish?", for the manager (Pending corrections). */
      kind: 'correction'
      id: string
      request: CorrectionRequest
      /** null = unscheduled session. */
      shift: Shift | null
      requester: User
      clockIn: EffectiveClockEvent | null
      clockOut: EffectiveClockEvent | null
    }

export const requestCreated = (i: RequestItem): Timestamp =>
  i.kind === 'extension' ? i.ext.created_at : i.kind === 'swap' ? i.swap.created_at : i.request.created_at

export async function loadRequests(viewer: User, settings: SiteSettings): Promise<RequestItem[]> {
  const role = await getPermissions(viewer.id)
  const [users, shifts] = await Promise.all([getUsers({ activeOnly: true }), getShifts({ status: 'published' })])
  const userById = new Map(users.map((u) => [u.id, u]))
  const shiftById = new Map(shifts.map((s) => [s.id, s]))
  const items: RequestItem[] = []
  // A person's counting clock events, oldest first, loaded once per person.
  const eventsOf = new Map<string, Promise<EffectiveClockEvent[]>>()
  const events = (userId: string) => {
    if (!eventsOf.has(userId)) eventsOf.set(userId, getEffectiveClockEvents({ userId }).then((es) => es.sort((a, b) => compareTs(a.server_time, b.server_time))))
    return eventsOf.get(userId)!
  }

  if (role.can_approve_extensions) {
    for (const ext of await getExtensions({ status: 'pending' })) {
      const shift = shiftById.get(ext.shift_id)
      const requester = userById.get(ext.requested_by)
      if (!shift || !requester) continue
      const others = (await getExtensions({ shiftId: shift.id })).filter((e) => e.id !== ext.id)
      const room = settings.max_shift_min - settings.standard_shift_min - approvedExtensionMinutes(others)
      const blocked = canApproveExtension(ext.minutes, others, settings)
        ? null
        : room > 0
          ? `Only ${room} more minutes can be approved on this shift.`
          : 'This shift already has the most extra time allowed.'
      const clockedOut = (await events(ext.requested_by)).findLast((e) => e.shift_id === shift.id && e.kind === 'out' && compareTs(e.server_time, ext.created_at) <= 0) ?? null
      items.push({ kind: 'extension', id: ext.id, ext, shift, requester, blocked, clockedOut })
    }
  }

  if (role.can_approve_swaps) {
    for (const swap of await getSwaps({ status: 'pending' })) {
      const shift = shiftById.get(swap.shift_id)
      const requester = userById.get(swap.requested_by)
      // Nobody decides their own request.
      if (!shift || !requester || swap.requested_by === viewer.id) continue
      if (role.can_approve_swaps === 'own_group' && requester.team_lead_id !== viewer.id) continue
      const otherId = swap.kind === 'swap' ? swap.target_user_id : swap.covered_by
      let candidates: User[] = []
      if (swap.kind === 'cover' && !swap.covered_by) {
        const [away, sameDay] = await Promise.all([getAvailability({ from: shift.date, to: shift.date }), getShifts({ from: shift.date, to: shift.date })])
        const busy = new Set([...away.map((a) => a.user_id), ...sameDay.map((s) => s.assigned_user_id)])
        candidates = users.filter((u) => u.role !== 'manager' && u.id !== requester.id && !busy.has(u.id))
      }
      items.push({ kind: 'swap', id: swap.id, swap, shift, requester, other: otherId ? (userById.get(otherId) ?? null) : null, candidates })
    }
  }

  // Only the manager corrects attendance, so only she sees these (PRD role table).
  if (role.can_correct_attendance) {
    for (const request of await getCorrectionRequests({ status: 'pending' })) {
      const requester = userById.get(request.requested_by)
      if (!requester) continue
      const mine = await events(request.requested_by)
      const at = mine.findIndex((e) => e.id === request.clock_event_id)
      if (at < 0) continue
      // The session it is about: the clock-in and the clock-out that closed it.
      const clockIn = request.kind === 'void' ? mine[at] : mine[at - 1]?.kind === 'in' ? mine[at - 1] : null
      const clockOut = request.kind === 'end_time' ? mine[at] : mine[at + 1]?.kind === 'out' ? mine[at + 1] : null
      const shiftId = mine[at].shift_id
      items.push({ kind: 'correction', id: request.id, request, shift: shiftId ? (shiftById.get(shiftId) ?? null) : null, requester, clockIn, clockOut })
    }
  }

  // Oldest first: the longest-waiting person is answered first.
  return items.sort((a, b) => compareTs(requestCreated(a), requestCreated(b)))
}
