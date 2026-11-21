// Extension requests. Up to 30 min per request; the manager alone approves; never beyond 3.5h total.
// Also asked after clocking out late ("Stayed to finish"). Same checks and wording as request_extension() and
// decide_extension() in 12_attendance_fixes.sql.
import type { Extension, RequestStatus, Timestamp, Uuid } from '@/types'
import { approvedShiftMinutes, canApproveExtension, compareTs, extraToApprove } from '@/lib/rules'
import { effectiveTime, isVoided, shiftSession } from './attendance'
import { settleSessionFlags } from './attendanceFixes'
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
  if (!shift) throw new Error('That shift is no longer on the roster')
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
    approved_min: null,
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
  if (!ext) throw new Error('That request is no longer there')
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
  // A session the approved length now covers: its over-length (and missing clock-out) flags are settled.
  if (input.approve) {
    for (const out of db.clockEvents.filter((e) => e.shift_id === ext.shift_id && e.kind === 'out' && !isVoided(e.id))) settleSessionFlags(out, actor)
  }
  return copy(ext)
}

/**
 * Carly's one answer on a shift's extra time, for every request still waiting on it (Requests card):
 * - approve: approves the time actually worked (once clocked out) or what was asked (still on shift). Past
 *   max_shift_min is allowed: the card warns first. Approving settles the session's over-length and
 *   missing clock-out flags.
 * - approve with finishAt + reason ("Correct time"): the finish she thinks is fair is saved first as a
 *   correction on the clock-out (the clock event never changes), then approved up to it.
 * - decline ("Not approved"): hours stay as recorded. Those flags are closed with a note, so it is one decision.
 * Each request is still decided once. Several waiting requests on one shift are decided together: the oldest
 * carries the approved minutes, the rest approve 0 (already counted).
 */
export async function decideExtraTime(input: { shiftId: Uuid; decidedBy: Uuid; approve: boolean; finishAt?: Timestamp; reason?: string }): Promise<Extension[]> {
  const actor = requireUser(input.decidedBy)
  if (!roleOf(actor).can_approve_extensions) throw new Error('Only the manager can approve extra time')
  const shift = db.shifts.find((s) => s.id === input.shiftId)
  if (!shift) throw new Error('That shift is no longer on the roster')
  const pending = db.extensions.filter((e) => e.shift_id === shift.id && e.status === 'pending').sort((a, b) => compareTs(a.created_at, b.created_at))
  if (pending.length === 0) throw new Error('Extension already decided')
  const now = serverNow()

  if (input.finishAt !== undefined) {
    if (!input.approve) throw new Error('A corrected finish is approved, not declined')
    const reason = (input.reason ?? '').trim()
    if (!reason) throw new Error('A correction needs a reason')
    const before = shiftSession(shift)
    if (!before.clock_in || !before.clock_out) throw new Error("There's no clock-out to correct yet")
    if (Number.isNaN(Date.parse(input.finishAt))) throw new Error('Invalid time')
    if (compareTs(input.finishAt, before.clock_in.effective_time) <= 0) throw new Error('Pick a finish after the clock-in')
    const out = db.clockEvents.find((e) => e.id === before.clock_out!.id)!
    db.corrections.push({ id: newId('correction'), clock_event_id: out.id, old_time: effectiveTime(out), new_time: input.finishAt, reason, corrected_by: actor.id, created_at: now })
  }

  const session = shiftSession(shift)
  const approvedBefore = approvedShiftMinutes(db.extensions.filter((e) => e.shift_id === shift.id && e.status === 'approved'), db.settings)
  const extra = session.worked_min === null ? null : extraToApprove(session.worked_min, approvedBefore, db.settings)
  pending.forEach((e, i) => {
    e.status = input.approve ? 'approved' : 'declined'
    e.decided_by = actor.id
    e.decided_at = now
    if (input.approve) e.approved_min = extra === null ? e.minutes : i === 0 ? extra : 0
  })

  const clockOut = session.clock_out && db.clockEvents.find((e) => e.id === session.clock_out!.id)
  if (clockOut && input.approve) settleSessionFlags(clockOut, actor)
  if (clockOut && !input.approve) {
    for (const f of db.flags) {
      if (f.resolved_at === null && f.shift_id === shift.id && f.user_id === session.user_id && (f.kind === 'over_without_extension' || f.kind === 'missing_clock_out')) {
        f.resolved_at = now
        f.resolved_by = actor.id
        f.resolved_note = 'Extra time not approved. Hours stay as recorded.'
      }
    }
  }
  return copy(pending)
}
