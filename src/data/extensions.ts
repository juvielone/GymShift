// Extension requests. Up to 30 min per request; the manager alone approves; never beyond 3.5h total.
import type { Extension, RequestStatus, Uuid } from '@/types'
import { canApproveExtension, compareTs } from '@/lib/rules'
import { copy, db, newId, requireUser, roleOf, serverNow } from './store'

export async function getExtensions(filter: { shiftId?: Uuid; userId?: Uuid; status?: RequestStatus } = {}): Promise<Extension[]> {
  return copy(
    db.extensions
      .filter(
        (e) =>
          (filter.shiftId === undefined || e.shift_id === filter.shiftId) &&
          (filter.userId === undefined || e.requested_by === filter.userId) &&
          (filter.status === undefined || e.status === filter.status),
      )
      .sort((a, b) => compareTs(b.created_at, a.created_at)),
  )
}

export async function requestExtension(input: { shiftId: Uuid; requestedBy: Uuid; minutes: number; reason: string }): Promise<Extension> {
  const shift = db.shifts.find((s) => s.id === input.shiftId)
  if (!shift) throw new Error(`Unknown shift ${input.shiftId}`)
  if (shift.assigned_user_id !== input.requestedBy) throw new Error('Only the assigned cleaner can request an extension')
  const reason = input.reason.trim()
  if (!reason) throw new Error('An extension needs a reason')
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > db.settings.max_extension_request_min) {
    throw new Error(`Extensions are 1–${db.settings.max_extension_request_min} minutes`)
  }
  const row: Extension = {
    id: newId('ext'),
    shift_id: shift.id,
    requested_by: input.requestedBy,
    minutes: input.minutes,
    reason,
    status: 'pending',
    created_at: serverNow(),
    decided_by: null,
    decided_at: null,
  }
  db.extensions.push(row)
  return copy(row)
}

/** Manager only. A request is decided once (pending → approved/declined) and never re-decided. */
export async function decideExtension(input: { extensionId: Uuid; decidedBy: Uuid; approve: boolean }): Promise<Extension> {
  const actor = requireUser(input.decidedBy)
  if (!roleOf(actor).can_approve_extensions) throw new Error('Only the manager can approve extensions')
  const ext = db.extensions.find((e) => e.id === input.extensionId)
  if (!ext) throw new Error(`Unknown extension ${input.extensionId}`)
  if (ext.status !== 'pending') throw new Error('Extension already decided')
  if (input.approve) {
    const others = db.extensions.filter((e) => e.shift_id === ext.shift_id && e.id !== ext.id)
    if (!canApproveExtension(ext.minutes, others, db.settings)) {
      throw new Error(`Approving would take the shift beyond ${db.settings.max_shift_min} minutes`)
    }
  }
  ext.status = input.approve ? 'approved' : 'declined'
  ext.decided_by = actor.id
  ext.decided_at = serverNow()
  return copy(ext)
}
