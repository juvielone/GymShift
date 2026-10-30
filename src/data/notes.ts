import type { Note, NoteTag, Timestamp, Uuid } from '@/types'
import { copy, db, newId, requireUser, roleOf, serverNow } from './store'
import { compareTs } from '@/lib/rules'

export async function getNotes(filter: { shiftId?: Uuid; userId?: Uuid; tag?: NoteTag; open?: boolean } = {}): Promise<Note[]> {
  return copy(
    db.notes
      .filter(
        (n) =>
          (filter.shiftId === undefined || n.shift_id === filter.shiftId) &&
          (filter.userId === undefined || n.user_id === filter.userId) &&
          (filter.tag === undefined || n.tag === filter.tag) &&
          (filter.open === undefined || (n.done_at === null) === filter.open),
      )
      .sort((a, b) => compareTs(b.created_at, a.created_at)),
  )
}

/** Open "Supplies low" notes for the manager dashboard. */
export async function getOpenSupplyAlerts(): Promise<Note[]> {
  return getNotes({ tag: 'supplies_low', open: true })
}

/** Open "Issue" notes (something wrong at the gym) for the manager dashboard. */
export async function getOpenIssues(): Promise<Note[]> {
  return getNotes({ tag: 'issue', open: true })
}

/**
 * On the author's own shift (the manager may note any shift). A 'running_late' note says when they
 * expect to arrive; it is information for Carly's Today card, never a task in her list.
 */
export async function addNote(input: { shiftId: Uuid; userId: Uuid; body: string; tag?: NoteTag; arriveBy?: Timestamp }): Promise<Note> {
  const author = requireUser(input.userId)
  const shift = db.shifts.find((s) => s.id === input.shiftId)
  if (!shift) throw new Error(`Unknown shift ${input.shiftId}`)
  if (shift.assigned_user_id !== author.id && roleOf(author).view_records_scope !== 'all') throw new Error('Notes can only be added to your own shift')
  const body = input.body.trim()
  if (!body) throw new Error('A note needs some text')
  const tag = input.tag ?? null
  if (tag === 'running_late' && !input.arriveBy) throw new Error('Say about when you will arrive')
  const row: Note = {
    id: newId('note'),
    shift_id: shift.id,
    user_id: author.id,
    body,
    tag,
    arrive_by: tag === 'running_late' ? (input.arriveBy ?? null) : null,
    created_at: serverNow(),
    done_at: null,
    done_by: null,
  }
  db.notes.push(row)
  return copy(row)
}

/** Manager only. */
export async function markNoteDone(input: { noteId: Uuid; doneBy: Uuid }): Promise<Note> {
  const actor = requireUser(input.doneBy)
  if (roleOf(actor).view_records_scope !== 'all') throw new Error('Only the manager can mark notes done')
  const note = db.notes.find((n) => n.id === input.noteId)
  if (!note) throw new Error(`Unknown note ${input.noteId}`)
  if (note.done_at === null) {
    note.done_at = serverNow()
    note.done_by = actor.id
  }
  return copy(note)
}
