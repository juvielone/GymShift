// Notes for the shift, at the top of the roster's shift sheet (PRD F8): Carly on anyone's shift, a team lead
// on their own group's. A compact row opens the note box; sent notes show whether the person on the shift
// has seen them. Whoever wrote a note (or Carly) can take it back after one confirm while the shift is
// still ahead or on. Also used in Carly's shift record sheet (from the Today pass). Nothing is deleted.
import { useCallback, useEffect, useState } from 'react'
import { Check, ClipboardList, LoaderCircle, Plus } from 'lucide-react'
import { addShiftNote, canAddShiftNote, getShiftNotes, getUsers, serverNow, withdrawShiftNote } from '@/data'
import type { ShiftNote } from '@/data'
import type { Shift, SiteSettings, User } from '@/types'
import { Textarea } from '@/components/ui/textarea'
import { Disc } from '@/components/common/ListParts'
import { smallButton } from '@/components/common/listStyles'
import { formatClock, formatDateShort, shortName, zonedTimestamp } from '@/lib/format'
import { compareTs, localDate } from '@/lib/rules'
import { cn } from '@/lib/utils'

interface Props {
  shift: Shift
  me: User
  settings: SiteSettings
  /** After sending, with a receipt line. The roster closes its sheet; the record sheet stays open. */
  onSent: (message: string) => void
}

export function ShiftNotesSection({ shift, me, settings, onSent }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [notes, setNotes] = useState<ShiftNote[]>([])
  const [canAdd, setCanAdd] = useState(false)
  const [writing, setWriting] = useState(false)
  const [body, setBody] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tz = settings.timezone
  const nameOf = (id: string) => shortName(users.find((u) => u.id === id)?.full_name ?? 'Someone')
  const person = nameOf(shift.assigned_user_id)
  const when = (ts: string) => `${formatDateShort(localDate(ts, settings))}, ${formatClock(ts, tz)}`

  const load = useCallback(async () => {
    const [rows, allowed, everyone] = await Promise.all([getShiftNotes({ viewerId: me.id, shiftIds: [shift.id] }), canAddShiftNote({ userId: me.id, shiftId: shift.id }), getUsers()])
    setNotes(rows)
    setCanAdd(allowed)
    setUsers(everyone)
  }, [me.id, shift.id])

  useEffect(() => {
    void load()
  }, [load])

  async function send() {
    setBusy('send')
    setError(null)
    try {
      await addShiftNote({ shiftId: shift.id, authorId: me.id, body })
      setBody('')
      setWriting(false)
      setBusy(null)
      await load()
      onSent(shift.status === 'published' ? `Note sent to ${person}.` : `Note saved. ${person} will see it when you publish.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not saved yet. Try again.')
      setBusy(null)
    }
  }

  async function takeBack(note: ShiftNote) {
    setBusy(note.id)
    setError(null)
    try {
      await withdrawShiftNote({ noteId: note.id, userId: me.id })
      setConfirmId(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not saved yet. Try again.')
    } finally {
      setBusy(null)
    }
  }

  if (notes.length === 0 && !canAdd) return null

  const started = compareTs(serverNow(), zonedTimestamp(shift.date, shift.start_time, tz)) >= 0
  const sees =
    shift.status !== 'published' ? `${person} sees it once you publish.` : started ? `${person} sees it next time they open the app.` : `${person} sees it on their home before the shift.`

  return (
    <section aria-labelledby="shift-notes" className="border-y border-border">
      <h3 id="shift-notes" className="sr-only">
        Note for {person}
      </h3>

      {notes.map((n) => (
        <div key={n.id} className="flex gap-3 border-b border-border px-1 py-3 last:border-b-0">
          <Disc tone="neutral">
            <ClipboardList />
          </Disc>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Note for {person}</p>
            <p className="mt-0.5 text-[15px] leading-snug whitespace-pre-line">{n.body}</p>
            <p className="mt-1 text-sm text-muted-foreground">{[nameOf(n.author_id), when(n.created_at)].join(' · ')}</p>
            {n.seen_at ? (
              <p className="mt-0.5 flex items-center gap-1 text-sm font-medium text-ok">
                <Check aria-hidden className="size-3.5" strokeWidth={3} />
                Seen {when(n.seen_at)}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-muted-foreground">Not seen yet</p>
            )}
            {canAdd && (n.author_id === me.id || me.role === 'manager') &&
              (confirmId === n.id ? (
                <div className="mt-2">
                  <p className="text-[15px]">{`Take back this note? ${person} won't see it any more.`}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setConfirmId(null)} className={cn(smallButton.outline, 'flex-1')}>
                      Keep it
                    </button>
                    <button type="button" onClick={() => void takeBack(n)} disabled={busy !== null} className={cn(smallButton.outline, 'flex-1 gap-2 text-warn')}>
                      {busy === n.id && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                      Take back
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmId(n.id)} disabled={busy !== null} className="-mx-1 mt-0.5 flex h-10 items-center px-1 text-sm font-medium text-muted-foreground underline underline-offset-[3px]">
                  Take back
                </button>
              ))}
          </div>
        </div>
      ))}

      {canAdd &&
        (writing ? (
          <div className={cn('px-1 py-3', notes.length > 0 && 'border-t border-border')}>
            <label htmlFor="shift-note-body" className="text-sm font-medium">
              Note for {person}
            </label>
            <Textarea
              id="shift-note-body"
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="For example: please dust studio 2"
              className="mt-1.5 min-h-20 text-base"
            />
            <p className="mt-1.5 text-sm text-muted-foreground">{sees}</p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setWriting(false)
                  setBody('')
                  setError(null)
                }}
                className={cn(smallButton.outline, 'flex-1')}
              >
                Cancel
              </button>
              <button type="button" onClick={() => void send()} disabled={busy !== null || !body.trim()} className={cn(smallButton.ink, 'flex-[2] gap-2')}>
                {busy === 'send' && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                Send to {person}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setWriting(true)}
            className={cn('flex min-h-14 w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-muted/60 active:bg-muted', notes.length > 0 && 'border-t border-border')}
          >
            <Disc tone="neutral">{notes.length > 0 ? <Plus /> : <ClipboardList />}</Disc>
            <span className="min-w-0 flex-1">
              <span className="block text-base leading-snug font-medium">{notes.length > 0 ? 'Add another note' : `Note for ${person}`}</span>
              {notes.length === 0 && <span className="block text-sm leading-snug text-muted-foreground">{sees}</span>}
            </span>
            {notes.length === 0 && <Plus aria-hidden className="size-5 shrink-0 text-muted-foreground" />}
          </button>
        ))}

      <p aria-live="polite" role="alert" className="px-1 pb-2 text-sm text-warn empty:hidden">
        {error}
      </p>
    </section>
  )
}
