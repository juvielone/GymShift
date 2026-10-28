// Swaps and covers. Manager approves any; team lead approves for their own group.
// Approval reassigns the shift via updateShift, which logs the change to shift_changes.
import type { RequestStatus, Swap, SwapKind, Uuid } from '@/types'
import { updateShift } from './shifts'
import { canActOn, copy, db, newId, requireUser, roleOf, serverNow } from './store'
import { compareTs } from '@/lib/rules'

export async function getSwaps(filter: { shiftId?: Uuid; userId?: Uuid; status?: RequestStatus } = {}): Promise<Swap[]> {
  return copy(
    db.swaps
      .filter(
        (s) =>
          (filter.shiftId === undefined || s.shift_id === filter.shiftId) &&
          (filter.userId === undefined || [s.requested_by, s.target_user_id, s.covered_by].includes(filter.userId)) &&
          (filter.status === undefined || s.status === filter.status),
      )
      .sort((a, b) => compareTs(b.created_at, a.created_at)),
  )
}

export async function requestSwap(input: {
  shiftId: Uuid
  requestedBy: Uuid
  kind: SwapKind
  targetUserId?: Uuid
  reason?: string
}): Promise<Swap> {
  const shift = db.shifts.find((s) => s.id === input.shiftId)
  if (!shift) throw new Error(`Unknown shift ${input.shiftId}`)
  if (shift.assigned_user_id !== input.requestedBy) throw new Error('Only the assigned cleaner can request a swap or cover')
  if (input.kind === 'swap' && !input.targetUserId) throw new Error('A swap needs a named colleague')
  const row: Swap = {
    id: newId('swap'),
    shift_id: shift.id,
    kind: input.kind,
    requested_by: input.requestedBy,
    target_user_id: input.kind === 'swap' ? input.targetUserId! : null,
    covered_by: null,
    reason: input.reason?.trim() || null,
    status: 'pending',
    created_at: serverNow(),
    decided_by: null,
    decided_at: null,
  }
  db.swaps.push(row)
  return copy(row)
}

/** For covers, pass `coveredBy` when approving. A request is decided once and never re-decided. */
export async function decideSwap(input: { swapId: Uuid; decidedBy: Uuid; approve: boolean; coveredBy?: Uuid }): Promise<Swap> {
  const actor = requireUser(input.decidedBy)
  const swap = db.swaps.find((s) => s.id === input.swapId)
  if (!swap) throw new Error(`Unknown swap ${input.swapId}`)
  if (swap.status !== 'pending') throw new Error('Swap already decided')
  const scope = roleOf(actor).can_approve_swaps ? (actor.role === 'manager' ? 'all' : 'own_group') : false
  if (actor.id === swap.requested_by || !canActOn(actor, swap.requested_by, scope)) {
    throw new Error('Not allowed to decide this swap')
  }
  if (input.approve) {
    const newAssignee = swap.kind === 'swap' ? swap.target_user_id : (input.coveredBy ?? null)
    if (!newAssignee) throw new Error('A cover needs someone to cover it')
    requireUser(newAssignee)
    swap.covered_by = swap.kind === 'cover' ? newAssignee : null
    await updateShift({ shiftId: swap.shift_id, changedBy: actor.id, patch: { assigned_user_id: newAssignee }, swapId: swap.id })
  }
  swap.status = input.approve ? 'approved' : 'declined'
  swap.decided_by = actor.id
  swap.decided_at = serverNow()
  return copy(swap)
}
