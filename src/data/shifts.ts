import type { DateString, Shift, ShiftChange, ShiftChangeField, ShiftStatus, Uuid } from '@/types'
import { compareTs, localDate } from '@/lib/rules'
import { canActOn, copy, db, newId, requireUser, roleOf, serverNow } from './store'

export async function getShifts(
  filter: { from?: DateString; to?: DateString; userId?: Uuid; status?: ShiftStatus; fortnightStart?: DateString } = {},
): Promise<Shift[]> {
  return copy(
    db.shifts
      .filter(
        (s) =>
          (filter.from === undefined || s.date >= filter.from) &&
          (filter.to === undefined || s.date <= filter.to) &&
          (filter.userId === undefined || s.assigned_user_id === filter.userId) &&
          (filter.status === undefined || s.status === filter.status) &&
          (filter.fortnightStart === undefined || s.fortnight_start === filter.fortnightStart),
      )
      .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time)),
  )
}

export async function getShift(id: Uuid): Promise<Shift | null> {
  return copy(db.shifts.find((s) => s.id === id) ?? null)
}

/** Published shifts for a user from today (site timezone) onwards — the home screen list. */
export async function getUpcomingShifts(userId: Uuid, limit = 5): Promise<Shift[]> {
  const today = localDate(serverNow(), db.settings)
  return (await getShifts({ userId, status: 'published', from: today })).slice(0, limit)
}

export async function getShiftChanges(shiftId: Uuid): Promise<ShiftChange[]> {
  return copy(db.shiftChanges.filter((c) => c.shift_id === shiftId).sort((a, b) => compareTs(a.changed_at, b.changed_at)))
}

type ShiftPatch = Partial<Pick<Shift, ShiftChangeField>>

/**
 * Edit a shift. Changes to a published shift are logged to shift_changes (who, when, old, new).
 * Internal callers (approved swaps) pass `swapId` so the log links back to the request.
 */
export async function updateShift(input: { shiftId: Uuid; changedBy: Uuid; patch: ShiftPatch; swapId?: Uuid }): Promise<Shift> {
  const shift = db.shifts.find((s) => s.id === input.shiftId)
  if (!shift) throw new Error(`Unknown shift ${input.shiftId}`)
  const actor = requireUser(input.changedBy)
  if (!input.swapId && !canActOn(actor, shift.assigned_user_id, roleOf(actor).can_publish_roster)) {
    throw new Error('Not allowed to edit this shift')
  }
  const changed_at = serverNow()
  for (const field of Object.keys(input.patch) as ShiftChangeField[]) {
    const next = input.patch[field]
    if (next === undefined || next === shift[field]) continue
    if (shift.status === 'published') {
      db.shiftChanges.push({
        id: newId('shift-change'),
        shift_id: shift.id,
        field,
        old_value: String(shift[field]),
        new_value: String(next),
        changed_by: actor.id,
        changed_at,
        swap_id: input.swapId ?? null,
      })
    }
    Object.assign(shift, { [field]: next })
  }
  return copy(shift)
}

/** Publish every draft shift in a fortnight that the actor is allowed to roster. */
export async function publishFortnight(input: { fortnightStart: DateString; publishedBy: Uuid }): Promise<Shift[]> {
  const actor = requireUser(input.publishedBy)
  const scope = roleOf(actor).can_publish_roster
  const published_at = serverNow()
  const toPublish = db.shifts.filter(
    (s) => s.fortnight_start === input.fortnightStart && s.status === 'draft' && canActOn(actor, s.assigned_user_id, scope),
  )
  for (const s of toPublish) {
    s.status = 'published'
    s.published_at = published_at
  }
  return copy(toPublish)
}
