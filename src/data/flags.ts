import type { Flag, FlagKind, Uuid } from '@/types'
import { copy, db, newId, requireUser, roleOf, serverNow } from './store'
import { compareTs } from '@/lib/rules'

export async function getFlags(filter: { open?: boolean; userId?: Uuid; shiftId?: Uuid; kind?: FlagKind } = {}): Promise<Flag[]> {
  return copy(
    db.flags
      .filter(
        (f) =>
          (filter.open === undefined || (f.resolved_at === null) === filter.open) &&
          (filter.userId === undefined || f.user_id === filter.userId) &&
          (filter.shiftId === undefined || f.shift_id === filter.shiftId) &&
          (filter.kind === undefined || f.kind === filter.kind),
      )
      .sort((a, b) => compareTs(b.created_at, a.created_at)),
  )
}

/** Manager only. Resolving records who/when; the flagged record itself is untouched. */
export async function resolveFlag(input: { flagId: Uuid; resolvedBy: Uuid }): Promise<Flag> {
  const actor = requireUser(input.resolvedBy)
  if (!roleOf(actor).can_correct_attendance) throw new Error('Only the manager can resolve flags')
  const flag = db.flags.find((f) => f.id === input.flagId)
  if (!flag) throw new Error(`Unknown flag ${input.flagId}`)
  if (flag.resolved_at === null) {
    flag.resolved_at = serverNow()
    flag.resolved_by = actor.id
  }
  return copy(flag)
}

/** Internal: raise a flag. Flags never block an action or change hours. */
export function raiseFlag(input: Omit<Flag, 'id' | 'created_at' | 'resolved_at' | 'resolved_by'>): Flag {
  const flag: Flag = { ...input, id: newId('flag'), created_at: serverNow(), resolved_at: null, resolved_by: null }
  db.flags.push(flag)
  return flag
}
