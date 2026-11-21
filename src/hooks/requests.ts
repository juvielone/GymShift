// Pending requests a viewer can decide, shaped for display. Shared by Carly's dashboard and the
// Team section on a team lead's home. Reads only through '@/data'; decisions are made elsewhere.
import { getCorrectionRequests, getEffectiveClockEvents, getExtensions, getFlags, getPermissions, getShiftAttendance, getShifts, getSwapCandidates, getSwaps, getUsers, serverNow } from '@/data'
import type { EffectiveClockEvent } from '@/data'
import type { CorrectionRequest, Extension, Flag, Shift, SiteSettings, Swap, Timestamp, User } from '@/types'
import { approvedShiftMinutes, compareTs, extraToApprove, isPastShiftMax, shiftStartAt } from '@/lib/rules'

/** Flags an extra-time card answers, so they show inside it instead of as separate rows. */
const EXTRA_TIME_FLAGS: Flag['kind'][] = ['over_without_extension', 'missing_clock_out']

export type RequestItem =
  | {
      /** One card per shift: every extra-time request still waiting on it, with the time actually worked. */
      kind: 'extension'
      /** The oldest waiting request's id. */
      id: string
      /** Waiting requests on the shift, oldest first. */
      exts: Extension[]
      shift: Shift
      requester: User
      /** Already approved on the shift before this decision: standard length plus earlier approvals. */
      approvedMin: number
      clockIn: EffectiveClockEvent | null
      /** null while still on shift. */
      clockOut: EffectiveClockEvent | null
      /** Recorded (corrected) time, null while still on shift. */
      workedMin: number | null
      /** What Approve adds: the time worked beyond approvedMin (clocked out), or what was asked (on shift). */
      extraMin: number
      /** Past max_shift_min once approved: Carly is warned, never blocked. */
      pastMax: boolean
      /** Site settings: the standard and maximum lengths and the leeway, for the card's wording and Correct time. */
      settings: SiteSettings
      /** Open over-length / missing clock-out flags on this session, answered by the card. */
      flags: Flag[]
    }
  | {
      kind: 'swap'
      id: string
      swap: Swap
      shift: Shift
      requester: User
      /** Who said yes to taking it (the named colleague, or whoever offered on a cover). */
      other: User | null
      /** For an open cover nobody offered on: who is free then and could be picked. */
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
  i.kind === 'extension' ? i.exts[0].created_at : i.kind === 'swap' ? i.swap.created_at : i.request.created_at

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
    const waiting = await getExtensions({ status: 'pending' })
    for (const shiftId of new Set(waiting.map((e) => e.shift_id))) {
      const shift = shiftById.get(shiftId)
      const exts = waiting.filter((e) => e.shift_id === shiftId).sort((a, b) => compareTs(a.created_at, b.created_at))
      const requester = userById.get(exts[0].requested_by)
      if (!shift || !requester) continue
      const all = await getExtensions({ shiftId })
      const approvedMin = approvedShiftMinutes(all.filter((e) => e.status === 'approved'), settings)
      const att = await getShiftAttendance(shiftId)
      const clockOut = att?.clock_out ?? null
      const workedMin = att?.worked_min ?? null
      const extraMin = workedMin === null ? exts.reduce((sum, e) => sum + e.minutes, 0) : extraToApprove(workedMin, approvedMin, settings)
      const flags = (await getFlags({ open: true, shiftId })).filter((f) => EXTRA_TIME_FLAGS.includes(f.kind) && f.user_id === requester.id)
      items.push({
        kind: 'extension', id: exts[0].id, exts, shift, requester, approvedMin, clockIn: att?.clock_in ?? null, clockOut, workedMin, extraMin,
        pastMax: isPastShiftMax(approvedMin + extraMin, settings), settings, flags,
      })
    }
  }

  if (role.can_approve_swaps) {
    const now = serverNow()
    for (const swap of await getSwaps({ status: 'pending' })) {
      const shift = shiftById.get(swap.shift_id)
      const requester = userById.get(swap.requested_by)
      if (!shift || !requester) continue
      // Nobody decides a request they are part of (Carly does); a shift that started or changed hands is past deciding.
      if ([swap.requested_by, swap.target_user_id, swap.covered_by].includes(viewer.id)) continue
      if (shift.assigned_user_id !== swap.requested_by || compareTs(shiftStartAt(shift, settings), now) <= 0) continue
      if (role.can_approve_swaps === 'own_group' && requester.team_lead_id !== viewer.id) continue
      // A named swap reaches the approver once the colleague has said yes.
      if (swap.kind === 'swap' && !swap.covered_by) continue
      const candidates = swap.covered_by ? [] : (await getSwapCandidates(shift.id)).filter((u) => u.id !== viewer.id)
      items.push({ kind: 'swap', id: swap.id, swap, shift, requester, other: swap.covered_by ? (userById.get(swap.covered_by) ?? null) : null, candidates })
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
