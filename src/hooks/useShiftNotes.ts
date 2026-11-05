// Notes for the shift on the cleaner home: loaded once for today's shift and the next ones, so the card
// under the pass (new notes) and the Next shifts cards (notes already seen) read the same list.
import { useCallback, useEffect, useState } from 'react'
import { getShiftNotes, getUsers, markShiftNoteSeen } from '@/data'
import type { ShiftNote } from '@/data'
import type { Shift, Timestamp, Uuid } from '@/types'
import { shortName } from '@/lib/format'

export interface ShiftNotes {
  notes: ShiftNote[]
  /** "Carly", "Gladys": who wrote each note. */
  authorName: (note: ShiftNote) => string
  /** Note id while its "Got it" is saving. */
  busy: Uuid | null
  error: string | null
  gotIt: (note: ShiftNote) => Promise<void>
}

export function useShiftNotes(userId: Uuid, shifts: Shift[], now: Timestamp): ShiftNotes {
  const [notes, setNotes] = useState<ShiftNote[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<Uuid | null>(null)
  const [error, setError] = useState<string | null>(null)
  const key = shifts.map((s) => s.id).join(',')

  const load = useCallback(async () => {
    const ids = key ? key.split(',') : []
    if (ids.length === 0) return setNotes([])
    const [rows, users] = await Promise.all([getShiftNotes({ viewerId: userId, shiftIds: ids }), getUsers()])
    setNotes(rows)
    setNames(Object.fromEntries(users.map((u) => [u.id, shortName(u.full_name)])))
  }, [key, userId])

  // Reloads with the home (every 30 s), so a note Carly adds shows up without a refresh.
  useEffect(() => {
    void load().catch(() => {})
  }, [load, now])

  const gotIt = useCallback(
    async (note: ShiftNote) => {
      setBusy(note.id)
      setError(null)
      try {
        await markShiftNoteSeen({ noteId: note.id, userId })
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Not saved yet. Check your internet and try again.')
      } finally {
        setBusy(null)
      }
    },
    [load, userId],
  )

  return { notes, authorName: (n) => names[n.author_id] ?? 'Your manager', busy, error, gotIt }
}
