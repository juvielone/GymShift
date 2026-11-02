// Fixing attendance entries (PRD F6): a cleaner's "This was a mistake" (void) and "When did you finish?"
// (end time) requests, Carly's decision, and Carly voiding a clock-in directly. Same checks and wording as
// 12_attendance_fixes.sql. Nothing is overwritten or deleted: a void is a clock_voids row, an end time a
// corrections row, and each request is decided once.
import type { ClockEvent, ClockVoid, CorrectionReason, CorrectionRequest, CorrectionRequestKind, RequestStatus, Timestamp, User, Uuid } from '@/types'
import { approvedShiftMinutes, compareTs, minutesBetween } from '@/lib/rules'
import { firstName } from '@/lib/format'
import { effectiveTime, isVoided, openClockIn, pairedIn, pairedOut, voidedSessions, type VoidedSession } from './attendance'
import { appendEvent, type ClockLocation, type ClockResult } from './clockEvents'
import { copy, db, newId, requireFreshClock, requireUser, roleOf, serverNow } from './store'

const VOID_REASONS: CorrectionReason[] = ['accidental_tap', 'wrong_time', 'other']
const END_TIME_REASONS: CorrectionReason[] = ['forgot_clock_out', 'confirm_auto_close', 'other']

export async function getCorrectionRequests(
  filter: { status?: RequestStatus; userId?: Uuid; clockEventId?: Uuid; kind?: CorrectionRequestKind } = {},
): Promise<CorrectionRequest[]> {
  return copy(
    db.correctionRequests
      .filter(
        (r) =>
          (filter.status === undefined || r.status === filter.status) &&
          (filter.userId === undefined || r.requested_by === filter.userId) &&
          (filter.clockEventId === undefined || r.clock_event_id === filter.clockEventId) &&
          (filter.kind === undefined || r.kind === filter.kind),
      )
      .sort((a, b) => compareTs(a.created_at, b.created_at)),
  )
}

export async function getClockVoids(filter: { clockEventId?: Uuid } = {}): Promise<ClockVoid[]> {
  return copy(db.clockVoids.filter((v) => filter.clockEventId === undefined || v.clock_event_id === filter.clockEventId))
}

/** Voided sessions for "Show voided", oldest first. */
export async function getVoidedSessions(filter: { userId?: Uuid; shiftId?: Uuid } = {}): Promise<VoidedSession[]> {
  return copy(voidedSessions(filter))
}

function requireEvent(id: Uuid, missing: string): ClockEvent {
  const event = db.clockEvents.find((e) => e.id === id)
  if (!event) throw new Error(missing)
  return event
}

function requireManager(actorId: Uuid, message: string): User {
  const actor = requireUser(actorId)
  if (!roleOf(actor).can_correct_attendance) throw new Error(message)
  return actor
}

const blank = (s: string | null | undefined) => (s ?? '').trim() === ''

/** "Josh: accidental tap (note)", the reason on the void or correction a request becomes. */
function requestReasonText(r: CorrectionRequest): string {
  const who = firstName(db.users.find((u) => u.id === r.requested_by)?.full_name ?? 'Cleaner')
  const labels: Record<CorrectionReason, string> = {
    accidental_tap: 'accidental tap',
    wrong_time: 'wrong time',
    forgot_clock_out: 'forgot to clock out',
    confirm_auto_close: 'confirmed the automatic clock-out',
    other: (r.note ?? '').trim(),
  }
  const note = r.reason_code !== 'other' && !blank(r.note) ? ` (${r.note!.trim()})` : ''
  return `${who}: ${labels[r.reason_code]}${note}`
}

/** What a session may run to: the shift's approved length, or the standard length when unscheduled. */
const approvedMinFor = (shiftId: Uuid | null) =>
  shiftId === null ? db.settings.standard_shift_min : approvedShiftMinutes(db.extensions.filter((e) => e.shift_id === shiftId), db.settings)

const resolveFlags = (match: (f: (typeof db.flags)[number]) => boolean, actor: User, at: Timestamp) => {
  for (const f of db.flags) {
    if (f.resolved_at === null && match(f)) {
      f.resolved_at = at
      f.resolved_by = actor.id
    }
  }
}

/**
 * Once a session's end is settled (a request or an extension approved): its missing clock-out flag is done,
 * and its over-length flag too when the approved length now covers the time worked. Internal to src/data.
 */
export function settleSessionFlags(clockOut: ClockEvent, actor: User): void {
  const clockIn = pairedIn(clockOut)
  if (!clockIn) return
  const now = serverNow()
  resolveFlags((f) => f.clock_event_id === clockIn.id && f.kind === 'missing_clock_out', actor, now)
  if (minutesBetween(effectiveTime(clockIn), effectiveTime(clockOut)) <= approvedMinFor(clockOut.shift_id)) {
    resolveFlags((f) => f.clock_event_id === clockOut.id && f.kind === 'over_without_extension', actor, now)
  }
}

/** Voids a clock-in and the clock-out that closed it; resolves their flags; answers requests still waiting on them. */
function voidSession(clockIn: ClockEvent, reason: string, actor: User): void {
  const out = pairedOut(clockIn)
  const events = out ? [clockIn, out] : [clockIn]
  const ids = new Set(events.map((e) => e.id))
  const now = serverNow()
  const request = db.correctionRequests.find((r) => r.clock_event_id === clockIn.id && r.kind === 'void' && r.status === 'pending')
  for (const e of events) {
    if (isVoided(e.id)) continue
    db.clockVoids.push({
      id: newId('void'),
      clock_event_id: e.id,
      old_time: effectiveTime(e),
      reason,
      voided_by: actor.id,
      voided_at: now,
      correction_request_id: request?.id ?? null,
    })
  }
  resolveFlags((f) => f.clock_event_id !== null && ids.has(f.clock_event_id), actor, now)
  for (const r of db.correctionRequests) {
    if (ids.has(r.clock_event_id) && r.status === 'pending') {
      r.status = r.kind === 'void' ? 'approved' : 'declined'
      r.decided_by = actor.id
      r.decided_at = now
    }
  }
}

/**
 * "This was a mistake" on your own clock-in. Still open: you are clocked out first (location as for any
 * clock-out, no length flags), so you can clock in properly straight away. Carly decides.
 */
export async function requestVoid(input: {
  clockEventId: Uuid
  userId: Uuid
  reasonCode: CorrectionReason
  note?: string
  location?: ClockLocation
}): Promise<{ request: CorrectionRequest; clockOut: ClockResult | null }> {
  const user = requireUser(input.userId)
  const event = db.clockEvents.find((e) => e.id === input.clockEventId)
  if (!event || event.user_id !== user.id) throw new Error('You can only ask about your own clock-in')
  if (event.kind !== 'in') throw new Error('Only a clock-in can be marked as a mistake')
  if (isVoided(event.id)) throw new Error('This clock-in was already removed')
  const asked = db.correctionRequests.filter((r) => r.clock_event_id === event.id)
  if (asked.some((r) => r.status === 'pending')) throw new Error('Carly already has this to check')
  if (asked.some((r) => r.kind === 'void' && r.status === 'declined')) throw new Error('Carly kept this clock-in')
  if (!VOID_REASONS.includes(input.reasonCode)) throw new Error('Pick what happened')
  if (input.reasonCode === 'other' && blank(input.note)) throw new Error('Say what happened')

  let clockOut: ClockResult | null = null
  if (openClockIn(user.id)?.id === event.id) {
    await requireFreshClock()
    clockOut = appendEvent(user.id, event.shift_id, 'out', input.location ?? { status: 'unavailable' })
  }
  const request: CorrectionRequest = {
    id: newId('creq'),
    kind: 'void',
    clock_event_id: event.id,
    requested_by: user.id,
    reason_code: input.reasonCode,
    note: blank(input.note) ? null : input.note!.trim(),
    requested_time: null,
    status: 'pending',
    created_at: serverNow(),
    decided_by: null,
    decided_at: null,
  }
  db.correctionRequests.push(request)
  return copy({ request, clockOut })
}

/**
 * "When did you finish?" on your own clock-out: one closed automatically, or one later than the approved end.
 * The time must fall between the clock-in and the clock-out as recorded. Carly decides.
 */
export async function requestEndTime(input: {
  clockEventId: Uuid
  userId: Uuid
  reasonCode: CorrectionReason
  requestedTime?: Timestamp
  note?: string
}): Promise<CorrectionRequest> {
  const user = requireUser(input.userId)
  const event = db.clockEvents.find((e) => e.id === input.clockEventId)
  if (!event || event.user_id !== user.id) throw new Error('You can only ask about your own clock-out')
  if (event.kind !== 'out' || isVoided(event.id)) throw new Error("That clock-out can't be changed")
  const clockIn = pairedIn(event)
  if (!clockIn) throw new Error('That clock-out has no clock-in to go with it')
  if (!END_TIME_REASONS.includes(input.reasonCode)) throw new Error('Pick what happened')
  if (input.reasonCode === 'confirm_auto_close' && event.source !== 'auto') throw new Error('Only an automatic clock-out can be confirmed')
  if (input.reasonCode === 'other' && blank(input.note)) throw new Error('Say what happened')
  if (event.source === 'phone' && minutesBetween(effectiveTime(clockIn), effectiveTime(event)) <= approvedMinFor(event.shift_id)) {
    throw new Error('Only a clock-out after your finish time can be changed here')
  }

  const wanted = input.reasonCode === 'confirm_auto_close' ? effectiveTime(event) : input.requestedTime
  if (!wanted || Number.isNaN(Date.parse(wanted))) throw new Error('Pick when you finished')
  if (compareTs(wanted, effectiveTime(clockIn)) <= 0 || compareTs(wanted, event.server_time) > 0) {
    throw new Error('Pick a time between your clock-in and your clock-out')
  }
  const asked = db.correctionRequests.filter((r) => r.clock_event_id === event.id)
  if (asked.some((r) => r.status === 'pending')) throw new Error('Carly already has this to check')
  if (asked.some((r) => r.status === 'declined')) throw new Error('Carly has already checked this clock-out')

  const request: CorrectionRequest = {
    id: newId('creq'),
    kind: 'end_time',
    clock_event_id: event.id,
    requested_by: user.id,
    reason_code: input.reasonCode,
    note: blank(input.note) ? null : input.note!.trim(),
    requested_time: wanted,
    status: 'pending',
    created_at: serverNow(),
    decided_by: null,
    decided_at: null,
  }
  db.correctionRequests.push(request)
  return copy(request)
}

/**
 * Manager only, once. Approving a void voids the session; approving an end time adds a correction (with the
 * request's reason) when it differs from the time on record. Either way the session's settled flags are resolved.
 */
export async function decideCorrectionRequest(input: { requestId: Uuid; decidedBy: Uuid; approve: boolean }): Promise<CorrectionRequest> {
  const actor = requireManager(input.decidedBy, 'Only the manager can decide corrections')
  const request = db.correctionRequests.find((r) => r.id === input.requestId)
  if (!request) throw new Error('That request is no longer there')
  if (request.status !== 'pending') throw new Error('This request was already decided')
  const event = requireEvent(request.clock_event_id, 'That request is no longer there')

  if (input.approve && request.kind === 'void') {
    voidSession(event, requestReasonText(request), actor)
    return copy(request)
  }
  const now = serverNow()
  if (input.approve && request.requested_time !== null) {
    if (compareTs(effectiveTime(event), request.requested_time) !== 0) {
      db.corrections.push({
        id: newId('correction'),
        clock_event_id: event.id,
        old_time: effectiveTime(event),
        new_time: request.requested_time,
        reason: requestReasonText(request),
        corrected_by: actor.id,
        created_at: now,
      })
    }
    settleSessionFlags(event, actor)
  }
  request.status = input.approve ? 'approved' : 'declined'
  request.decided_by = actor.id
  request.decided_at = now
  return copy(request)
}

/** Carly voids a clock-in herself, with a reason (and its clock-out with it). A waiting void request is approved by it. */
export async function voidClockIn(input: { clockEventId: Uuid; voidedBy: Uuid; reason: string }): Promise<ClockVoid> {
  const actor = requireManager(input.voidedBy, 'Only the manager can void a clock-in')
  const event = requireEvent(input.clockEventId, 'That clock-in is no longer there')
  if (event.kind !== 'in') throw new Error('Only a clock-in can be voided')
  if (isVoided(event.id)) throw new Error('This clock-in was already voided')
  if (blank(input.reason)) throw new Error('A void needs a reason')
  voidSession(event, input.reason.trim(), actor)
  return copy(db.clockVoids.find((v) => v.clock_event_id === event.id)!)
}
