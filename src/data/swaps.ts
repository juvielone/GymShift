// Swaps and covers (PRD F3). Mirrors 15_swaps.sql: the person on a shift asks a named colleague or anyone
// free; someone says yes; then the manager or team lead approves (never someone who is part of it), and
// approval reassigns the shift via updateShift, which logs the change with the request's id.
// Every request is decided once (approved, declined or withdrawn) and never deleted.
import type { RequestStatus, Shift, Swap, User, Uuid } from '@/types'
import { updateShift } from './shifts'
import { copy, db, newId, requireUser, roleOf, serverNow } from './store'
import { compareTs, shiftEndAt, shiftStartAt } from '@/lib/rules'

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

/** No other shift of theirs (published or draft) overlaps this one. Same as private.is_free_for. */
function isFreeFor(userId: Uuid, shift: Shift): boolean {
  const start = shiftStartAt(shift, db.settings)
  const end = shiftEndAt(shift, db.settings)
  return !db.shifts.some(
    (o) =>
      o.assigned_user_id === userId &&
      o.id !== shift.id &&
      o.status !== 'cancelled' &&
      compareTs(shiftStartAt(o, db.settings), end) < 0 &&
      compareTs(shiftEndAt(o, db.settings), start) > 0,
  )
}

/**
 * Who the person on a shift could ask: active staff other than them and the manager, free at that time and
 * not marked unavailable that day, by first name.
 */
export async function getSwapCandidates(shiftId: Uuid): Promise<User[]> {
  const shift = db.shifts.find((s) => s.id === shiftId)
  if (!shift) return []
  const away = new Set(db.availability.filter((a) => a.date === shift.date).map((a) => a.user_id))
  return copy(
    db.users
      .filter((u) => u.active && u.role !== 'manager' && u.id !== shift.assigned_user_id && !away.has(u.id) && isFreeFor(u.id, shift))
      .sort((a, b) => a.full_name.localeCompare(b.full_name)),
  )
}

/** The request's shift, still as it was asked about: published, not started, still the asker's. */
function swapShift(swap: Swap): Shift {
  const shift = db.shifts.find((s) => s.id === swap.shift_id)
  if (!shift || shift.status !== 'published' || shift.assigned_user_id !== swap.requested_by) {
    throw new Error('This shift changed, so this request no longer applies')
  }
  if (compareTs(shiftStartAt(shift, db.settings), serverNow()) <= 0) {
    throw new Error(`This shift has started, so it stays with ${requireUser(shift.assigned_user_id).full_name}`)
  }
  return shift
}

function pendingSwap(swapId: Uuid): Swap {
  const swap = db.swaps.find((s) => s.id === swapId)
  if (!swap) throw new Error('That request is no longer there')
  if (swap.status === 'withdrawn') throw new Error('This request was withdrawn')
  if (swap.status !== 'pending') throw new Error('This request was already decided')
  return swap
}

function settle(swap: Swap, status: Exclude<RequestStatus, 'pending'>, by: Uuid): Swap {
  swap.status = status
  swap.decided_by = by
  swap.decided_at = serverNow()
  return copy(swap)
}

/** Ask a named colleague (targetUserId), or anyone free (no targetUserId: a cover). */
export async function requestSwap(input: { shiftId: Uuid; requestedBy: Uuid; targetUserId?: Uuid | null; reason?: string | null }): Promise<Swap> {
  const shift = db.shifts.find((s) => s.id === input.shiftId)
  if (!shift || shift.status === 'cancelled') throw new Error('That shift is no longer on the roster')
  if (shift.assigned_user_id !== input.requestedBy) throw new Error('Only the person on this shift can ask')
  if (shift.status !== 'published') throw new Error('Only a published shift can be handed over')
  if (compareTs(shiftStartAt(shift, db.settings), serverNow()) <= 0) throw new Error("This shift has started, so it can't be handed over now")
  if (db.swaps.some((s) => s.shift_id === shift.id && s.status === 'pending')) throw new Error('You already asked about this shift. Withdraw that first.')
  const target = input.targetUserId ?? null
  if (target) {
    if (target === input.requestedBy) throw new Error('Pick someone else')
    const person = requireUser(target)
    if (!person.active) throw new Error('That person is no longer active')
    if (!isFreeFor(target, shift)) throw new Error(`${person.full_name} is working then`)
  }
  const row: Swap = {
    id: newId('swap'),
    shift_id: shift.id,
    kind: target ? 'swap' : 'cover',
    requested_by: input.requestedBy,
    target_user_id: target,
    covered_by: null,
    accepted_at: null,
    reason: input.reason?.trim() || null,
    status: 'pending',
    created_at: serverNow(),
    decided_by: null,
    decided_at: null,
  }
  db.swaps.push(row)
  return copy(row)
}

/** The colleague asked says yes or no; for an open cover, anyone free says yes ("I'll take it"). */
export async function answerSwap(input: { swapId: Uuid; userId: Uuid; yes: boolean }): Promise<Swap> {
  const swap = pendingSwap(input.swapId)
  if (swap.requested_by === input.userId) throw new Error('This is your own request')
  if (swap.kind === 'swap' && swap.target_user_id !== input.userId) throw new Error('This request is for someone else')
  if (swap.accepted_at) throw new Error('Someone already said yes to this shift')
  if (!input.yes) {
    if (swap.kind === 'cover') throw new Error('Only the person asked can say no')
    return settle(swap, 'declined', input.userId)
  }
  const shift = swapShift(swap)
  if (!isFreeFor(input.userId, shift)) throw new Error("You're working then, so you can't take this shift")
  swap.covered_by = input.userId
  swap.accepted_at = serverNow()
  return copy(swap)
}

export async function withdrawSwap(input: { swapId: Uuid; userId: Uuid }): Promise<Swap> {
  const swap = pendingSwap(input.swapId)
  if (swap.requested_by !== input.userId) throw new Error('Only the person who asked can withdraw it')
  return settle(swap, 'withdrawn', input.userId)
}

/**
 * Manager or team lead, once. A swap needs the colleague's yes first; a cover takes whoever offered, or
 * `coveredBy` when nobody has. Nobody decides a request they are part of: Carly does.
 */
export async function decideSwap(input: { swapId: Uuid; decidedBy: Uuid; approve: boolean; coveredBy?: Uuid }): Promise<Swap> {
  const actor = requireUser(input.decidedBy)
  if (!actor.active || !roleOf(actor).can_approve_swaps) throw new Error('Not allowed to decide this swap')
  const swap = pendingSwap(input.swapId)
  const taker = swap.covered_by ?? (swap.kind === 'cover' ? (input.coveredBy ?? null) : null)
  if (actor.id === swap.requested_by || actor.id === taker) throw new Error("You're part of this request, so Carly decides it")
  if (!input.approve) return settle(swap, 'declined', actor.id)
  if (swap.kind === 'swap' && !swap.covered_by) throw new Error(`${requireUser(swap.target_user_id!).full_name} hasn't said yes yet`)
  if (!taker) throw new Error('A cover needs someone to cover it')
  const shift = swapShift(swap)
  const person = requireUser(taker)
  if (!person.active) throw new Error('That person is no longer active')
  if (!isFreeFor(taker, shift)) throw new Error(`${person.full_name} is working then`)
  await updateShift({ shiftId: shift.id, changedBy: actor.id, patch: { assigned_user_id: taker }, swapId: swap.id })
  swap.covered_by = taker
  return settle(swap, 'approved', actor.id)
}
