// Work-photo uploads from the phone's own picker: shrink each photo, save one at a time, and keep
// any that didn't save on screen with a retry. Never blocks anything else on the home screen.
import { useCallback, useEffect, useRef, useState } from 'react'
import { uploadPhoto, type PhotoTarget } from '@/data'
import { compressPhoto } from '@/lib/image'

/** retry: network or storage hiccup, try again. full / closed / unreadable: trying again won't help. */
export type UploadProblem = 'retry' | 'full' | 'closed' | 'unreadable'

export interface QueuedPhoto {
  key: string
  file: File
  /** Local preview of the original, shown while it saves. */
  preview: string
  status: 'saving' | 'failed'
  problem: UploadProblem | null
}

function problemOf(e: unknown): UploadProblem {
  const msg = e instanceof Error ? e.message : ''
  if (/at most/i.test(msg)) return 'full'
  if (/closed/i.test(msg)) return 'closed'
  return 'retry'
}

interface Options {
  /** The rostered shift, or the clock-in off the roster. null = nowhere to add photos. */
  target: PhotoTarget | null
  userId: string
  /** How many more photos fit on this shift (saved photos already counted). */
  room: number
  /** After each photo saves, so the home screen reloads its list. */
  onSaved: () => void
}

export function usePhotoUploads({ target, userId, room, onSaved }: Options) {
  const [queue, setQueue] = useState<QueuedPhoto[]>([])
  /** "Only 2 more fit": shown when more photos were picked than the shift has room for. */
  const [notice, setNotice] = useState<string | null>(null)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const latest = useRef({ target, userId, onSaved })
  useEffect(() => {
    latest.current = { target, userId, onSaved }
  }, [target, userId, onSaved])

  // The "only N more fit" line is for the moment of picking; it clears itself after a short read.
  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 10_000)
    return () => window.clearTimeout(id)
  }, [notice])

  // Free the local previews when the screen goes away.
  const previews = useRef(new Set<string>())
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const update = (key: string, patch: Partial<QueuedPhoto>) => setQueue((q) => q.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  const drop = (key: string) =>
    setQueue((q) => {
      const gone = q.find((p) => p.key === key)
      if (gone) {
        URL.revokeObjectURL(gone.preview)
        previews.current.delete(gone.preview)
      }
      return q.filter((p) => p.key !== key)
    })

  /** Saves in order, one at a time, so a phone holding several big photos doesn't run out of memory. */
  const save = useCallback((item: QueuedPhoto) => {
    chain.current = chain.current.then(async () => {
      const { target: to, userId: uid } = latest.current
      if (!to) return
      let file: Blob
      try {
        file = await compressPhoto(item.file)
      } catch {
        // Not an image this phone's browser can open (or a broken file): trying again won't help.
        update(item.key, { status: 'failed', problem: 'unreadable' })
        return
      }
      try {
        await uploadPhoto({ ...to, userId: uid, file })
        drop(item.key)
        latest.current.onSaved()
      } catch (e) {
        update(item.key, { status: 'failed', problem: problemOf(e) })
      }
    })
  }, [])

  const add = useCallback(
    (files: File[]) => {
      const saving = queue.filter((p) => p.status === 'saving').length
      const fits = Math.max(0, room - saving)
      const take = files.slice(0, fits)
      setNotice(files.length > fits ? (fits === 0 ? 'This shift already has the most photos.' : `Only ${fits} more fit, so the first ${fits} are being added.`) : null)
      const items = take.map<QueuedPhoto>((file) => {
        const preview = URL.createObjectURL(file)
        previews.current.add(preview)
        return { key: crypto.randomUUID(), file, preview, status: 'saving', problem: null }
      })
      setQueue((q) => [...q, ...items])
      items.forEach(save)
    },
    [queue, room, save],
  )

  /** Opens the phone's own picker (take a photo or choose several). Must run inside a tap. */
  const pick = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    // iOS only opens a picker for an input that is in the page.
    input.style.display = 'none'
    document.body.append(input)
    const done = () => input.remove()
    input.addEventListener('change', () => {
      add(Array.from(input.files ?? []))
      done()
    })
    input.addEventListener('cancel', done)
    input.click()
  }, [add])

  /** Tap on a photo that didn't save: try again when that can help, otherwise clear it away. */
  const retry = useCallback(
    (key: string) => {
      const item = queue.find((p) => p.key === key)
      if (!item) return
      if (item.problem !== 'retry') return drop(key)
      update(key, { status: 'saving', problem: null })
      save(item)
    },
    [queue, save],
  )

  return { queue, notice, pick, retry }
}
