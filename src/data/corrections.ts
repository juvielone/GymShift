// Attendance corrections (manager only). The clock event is NEVER modified — a correction row is
// appended with who, when, old value, new value and reason, and becomes the effective time.
import type { Correction, Timestamp, Uuid } from '@/types'
import { effectiveTime, isVoided } from './attendance'
import { copy, db, newId, requireUser, roleOf, serverNow } from './store'
import { compareTs } from '@/lib/rules'

export async function getCorrections(filter: { clockEventId?: Uuid } = {}): Promise<Correction[]> {
  return copy(
    db.corrections
      .filter((c) => filter.clockEventId === undefined || c.clock_event_id === filter.clockEventId)
      .sort((a, b) => compareTs(a.created_at, b.created_at)),
  )
}

export async function addCorrection(input: { clockEventId: Uuid; newTime: Timestamp; reason: string; correctedBy: Uuid }): Promise<Correction> {
  const actor = requireUser(input.correctedBy)
  if (!roleOf(actor).can_correct_attendance) throw new Error('Only the manager can correct attendance')
  const reason = input.reason.trim()
  if (!reason) throw new Error('A correction needs a reason')
  if (Number.isNaN(Date.parse(input.newTime))) throw new Error('Invalid time')
  const event = db.clockEvents.find((e) => e.id === input.clockEventId)
  if (!event) throw new Error('That clock event is no longer there')
  if (isVoided(event.id)) throw new Error("A voided clock event can't be corrected")

  const correction: Correction = {
    id: newId('correction'),
    clock_event_id: event.id,
    old_time: effectiveTime(event),
    new_time: input.newTime,
    reason,
    corrected_by: actor.id,
    created_at: serverNow(),
  }
  db.corrections.push(correction)
  return copy(correction)
}
