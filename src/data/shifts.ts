import type { DateString, Shift, ShiftChange, ShiftChangeField, ShiftStatus, ShiftType, TimeString, User, Uuid } from '@/types'
import { addDays, compareTs, defaultEndTime, fortnightStartOf, localDate } from '@/lib/rules'
import { canActOn, copy, db, newId, requireUser, roleOf, serverNow } from './store'

/** Roster permission check, mirroring the planned RLS policy on shifts. */
function requireRosterer(actorId: Uuid, assigneeId: Uuid): User {
  const actor = requireUser(actorId)
  if (!canActOn(actor, assigneeId, roleOf(actor).can_publish_roster)) throw new Error('Not allowed to roster this shift')
  return actor
}

/** Hours are counted against the shift's assignee, so a shift someone has clocked into keeps its owner. */
const hasClockEvents = (shiftId: Uuid) => db.clockEvents.some((e) => e.shift_id === shiftId)

function logChange(shift: Shift, field: ShiftChangeField, next: string, changedBy: Uuid, changed_at: string, swapId: Uuid | null) {
  db.shiftChanges.push({
    id: newId('shift-change'),
    shift_id: shift.id,
    field,
    old_value: String(shift[field]),
    new_value: next,
    changed_by: changedBy,
    changed_at,
    swap_id: swapId,
  })
}

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

/** Every logged change to the shifts of one fortnight, oldest first. */
export async function getShiftChangesForFortnight(fortnightStart: DateString): Promise<ShiftChange[]> {
  const ids = new Set(db.shifts.filter((s) => s.fortnight_start === fortnightStart).map((s) => s.id))
  return copy(db.shiftChanges.filter((c) => ids.has(c.shift_id)).sort((a, b) => compareTs(a.changed_at, b.changed_at)))
}

/** Status changes go through removeShift / publishFortnight, never a plain edit. */
type ShiftPatch = Partial<Pick<Shift, Exclude<ShiftChangeField, 'status'>>>

/**
 * Edit a shift. Changes to a published shift are logged to shift_changes (who, when, old, new).
 * Internal callers (approved swaps) pass `swapId` so the log links back to the request.
 */
export async function updateShift(input: { shiftId: Uuid; changedBy: Uuid; patch: ShiftPatch; swapId?: Uuid }): Promise<Shift> {
  const shift = db.shifts.find((s) => s.id === input.shiftId)
  if (!shift) throw new Error(`Unknown shift ${input.shiftId}`)
  if (shift.status === 'cancelled') throw new Error('This shift was cancelled')
  const actor = requireUser(input.changedBy)
  const nextUser = input.patch.assigned_user_id
  if (!input.swapId) {
    requireRosterer(actor.id, shift.assigned_user_id)
    if (nextUser) requireRosterer(actor.id, nextUser)
  }
  if (nextUser && nextUser !== shift.assigned_user_id && hasClockEvents(shift.id)) {
    throw new Error("Someone has clocked into this shift, so it can't be reassigned. Correct the attendance instead.")
  }
  const changed_at = serverNow()
  for (const field of Object.keys(input.patch) as (keyof ShiftPatch)[]) {
    const next = input.patch[field]
    if (next === undefined || next === shift[field]) continue
    if (shift.status === 'published') logChange(shift, field, String(next), actor.id, changed_at, input.swapId ?? null)
    Object.assign(shift, { [field]: next })
  }
  return copy(shift)
}

/** The shift holding a roster slot (date + type): a draft or published one, never a cancelled one. */
const activeIn = (date: DateString, type: ShiftType) => db.shifts.find((s) => s.date === date && s.type === type && s.status !== 'cancelled')

/**
 * Add a shift to the roster as a draft; it goes live on the next publish. Times default from
 * site settings (morning/night start, standard length). One active shift per date and type.
 */
export async function createShift(input: {
  date: DateString
  type: ShiftType
  assignedUserId: Uuid
  createdBy: Uuid
  start_time?: TimeString
  end_time?: TimeString
}): Promise<Shift> {
  const actor = requireRosterer(input.createdBy, input.assignedUserId)
  if (!requireUser(input.assignedUserId).active) throw new Error('That person is no longer active')
  if (activeIn(input.date, input.type)) throw new Error('That shift is already on the roster')
  const settings = db.settings
  const start_time = input.start_time ?? (input.type === 'morning' ? settings.default_morning_start : settings.default_night_start)
  const row: Shift = {
    id: newId('shift'),
    date: input.date,
    type: input.type,
    start_time,
    end_time: input.end_time ?? defaultEndTime(start_time, settings),
    assigned_user_id: input.assignedUserId,
    status: 'draft',
    fortnight_start: fortnightStartOf(input.date, settings),
    created_by: actor.id,
    created_at: serverNow(),
    published_at: null,
  }
  db.shifts.push(row)
  return copy(row)
}

/**
 * Take a shift off the roster. A draft nobody has seen is deleted; a published shift is never
 * deleted, it is set to 'cancelled' and the change is logged. A shift with clock events stays,
 * because its hours must still be paid.
 */
export async function removeShift(input: { shiftId: Uuid; removedBy: Uuid }): Promise<{ removed: 'deleted' | 'cancelled' }> {
  const shift = db.shifts.find((s) => s.id === input.shiftId)
  if (!shift) throw new Error(`Unknown shift ${input.shiftId}`)
  if (shift.status === 'cancelled') throw new Error('This shift was already cancelled')
  const actor = requireRosterer(input.removedBy, shift.assigned_user_id)
  if (hasClockEvents(shift.id)) throw new Error('Someone has clocked into this shift, so it stays on the roster.')
  if (shift.status === 'draft') {
    db.shifts.splice(db.shifts.indexOf(shift), 1)
    return { removed: 'deleted' }
  }
  logChange(shift, 'status', 'cancelled', actor.id, serverNow(), null)
  shift.status = 'cancelled'
  return { removed: 'cancelled' }
}

/** Fill a fortnight with drafts copied from another: same day, type, times and cleaner. Filled slots are skipped. */
export async function copyFortnight(input: { fromStart: DateString; toStart: DateString; createdBy: Uuid }): Promise<Shift[]> {
  const offset = Math.round((Date.parse(`${input.toStart}T00:00:00Z`) - Date.parse(`${input.fromStart}T00:00:00Z`)) / 86_400_000)
  const source = db.shifts.filter((s) => s.fortnight_start === input.fromStart && s.status !== 'cancelled')
  const created: Shift[] = []
  for (const s of source) {
    const date = addDays(s.date, offset)
    if (!requireUser(s.assigned_user_id).active || activeIn(date, s.type)) continue
    created.push(await createShift({ date, type: s.type, assignedUserId: s.assigned_user_id, createdBy: input.createdBy, start_time: s.start_time, end_time: s.end_time }))
  }
  return created
}

export type RosterWarningKind = 'unavailable' | 'double_booked'
export interface RosterWarning {
  shift_id: Uuid
  kind: RosterWarningKind
  /** The availability note, when the cleaner left one. */
  note: string | null
}

/** Clashes to show while building the roster. Warnings never block saving or publishing. */
export async function getRosterWarnings(fortnightStart: DateString): Promise<RosterWarning[]> {
  const shifts = db.shifts.filter((s) => s.fortnight_start === fortnightStart && s.status !== 'cancelled')
  const warnings: RosterWarning[] = []
  for (const s of shifts) {
    const away = db.availability.find((a) => a.user_id === s.assigned_user_id && a.date === s.date)
    if (away) warnings.push({ shift_id: s.id, kind: 'unavailable', note: away.note })
    if (shifts.some((o) => o.id !== s.id && o.date === s.date && o.assigned_user_id === s.assigned_user_id)) {
      warnings.push({ shift_id: s.id, kind: 'double_booked', note: null })
    }
  }
  return copy(warnings)
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
