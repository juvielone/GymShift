// Notes for the shift (PRD F8, decided 5 Nov 2026): Carly, or a team lead for their own group, leaves a note
// on a shift that whoever works it sees on their home before they start, and taps "Got it".
// Same checks and wording as supabase/migrations/…16_shift_instructions.sql.
// A note belongs to the shift, so a swap passes it on. Nothing is edited or deleted.
import type { Shift, ShiftInstruction, Timestamp, User, Uuid } from '@/types'
import { compareTs, shiftEndAt } from '@/lib/rules'
import { canActOn, copy, db, newId, requireUser, roleOf, serverNow } from './store'

/** A note as one person sees it. `seen_at` is when the person now on the shift tapped "Got it". */
export interface ShiftNote extends ShiftInstruction {
  seen_at: Timestamp | null
}

/** The manager on anyone's shift, a team lead on their own group's; never on your own. Mirrors private.can_instruct(). */
function canInstruct(actor: User, shift: Shift): boolean {
  const scope = roleOf(actor).view_records_scope
  return shift.assigned_user_id !== actor.id && scope !== 'own' && canActOn(actor, shift.assigned_user_id, scope)
}

/** Mirrors the shift_instructions read policy: the person on the shift, their lead, Carly, and whoever wrote it. Drafts only for rosterers. */
function canRead(viewer: User, note: ShiftInstruction, shift: Shift): boolean {
  if (shift.status === 'draft' && roleOf(viewer).can_publish_roster === false) return false
  return note.author_id === viewer.id || canActOn(viewer, shift.assigned_user_id, roleOf(viewer).view_records_scope)
}

function view(note: ShiftInstruction, shift: Shift): ShiftNote {
  const read = db.shiftInstructionReads.find((r) => r.instruction_id === note.id && r.user_id === shift.assigned_user_id)
  return { ...note, seen_at: read?.seen_at ?? null }
}

/** Notes on these shifts that the viewer may see, oldest first. Taken-back notes only when asked for. */
export async function getShiftNotes(input: { viewerId: Uuid; shiftIds: Uuid[]; includeWithdrawn?: boolean }): Promise<ShiftNote[]> {
  const viewer = requireUser(input.viewerId)
  const ids = new Set(input.shiftIds)
  const out: ShiftNote[] = []
  for (const note of db.shiftInstructions) {
    if (!ids.has(note.shift_id) || (note.withdrawn_at !== null && !input.includeWithdrawn)) continue
    const shift = db.shifts.find((s) => s.id === note.shift_id)
    if (shift && canRead(viewer, note, shift)) out.push(view(note, shift))
  }
  return copy(out.sort((a, b) => compareTs(a.created_at, b.created_at)))
}

/** Can this person leave a note on this shift? For the UI; addShiftNote checks again. */
export async function canAddShiftNote(input: { userId: Uuid; shiftId: Uuid }): Promise<boolean> {
  const shift = db.shifts.find((s) => s.id === input.shiftId)
  return !!shift && shift.status !== 'cancelled' && canInstruct(requireUser(input.userId), shift) && compareTs(shiftEndAt(shift, db.settings), serverNow()) > 0
}

export async function addShiftNote(input: { shiftId: Uuid; authorId: Uuid; body: string }): Promise<ShiftNote> {
  const author = requireUser(input.authorId)
  const shift = db.shifts.find((s) => s.id === input.shiftId)
  if (!shift) throw new Error('That shift is no longer on the roster')
  if (shift.assigned_user_id === author.id) throw new Error('This is your own shift')
  if (!canInstruct(author, shift)) throw new Error('Only Carly or their team lead can leave a note for this shift')
  if (shift.status === 'cancelled') throw new Error('This shift is cancelled')
  if (compareTs(shiftEndAt(shift, db.settings), serverNow()) <= 0) throw new Error('This shift has already finished')
  const body = input.body.trim()
  if (!body) throw new Error('A note needs some text')
  const row: ShiftInstruction = {
    id: newId('instr'),
    shift_id: shift.id,
    author_id: author.id,
    body,
    created_at: serverNow(),
    withdrawn_at: null,
    withdrawn_by: null,
  }
  db.shiftInstructions.push(row)
  return copy(view(row, shift))
}

/** "Got it": only the person now on the (published) shift. Tapping again keeps the first time. */
export async function markShiftNoteSeen(input: { noteId: Uuid; userId: Uuid }): Promise<ShiftNote> {
  const user = requireUser(input.userId)
  const note = db.shiftInstructions.find((n) => n.id === input.noteId)
  if (!note) throw new Error('That note is no longer there')
  const shift = db.shifts.find((s) => s.id === note.shift_id)
  if (!shift || shift.assigned_user_id !== user.id || shift.status !== 'published') throw new Error('This note is for someone else')
  if (!db.shiftInstructionReads.some((r) => r.instruction_id === note.id && r.user_id === user.id)) {
    db.shiftInstructionReads.push({ instruction_id: note.id, user_id: user.id, seen_at: serverNow() })
  }
  return copy(view(note, shift))
}

/** Take a note back: whoever wrote it, or the manager. It stays on record; the person on the shift stops seeing it. */
export async function withdrawShiftNote(input: { noteId: Uuid; userId: Uuid }): Promise<ShiftNote> {
  const actor = requireUser(input.userId)
  const note = db.shiftInstructions.find((n) => n.id === input.noteId)
  if (!note) throw new Error('That note is no longer there')
  if (note.author_id !== actor.id && roleOf(actor).view_records_scope !== 'all') throw new Error('Only whoever wrote it, or Carly, can take this note back')
  if (note.withdrawn_at === null) {
    note.withdrawn_at = serverNow()
    note.withdrawn_by = actor.id
  }
  const shift = db.shifts.find((s) => s.id === note.shift_id)
  return copy(shift ? view(note, shift) : { ...note, seen_at: null })
}
