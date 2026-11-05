// One roster slot (a date's morning or night shift) in a sheet: tap a name to assign, tweak the
// times, take it off the roster, and read what changed after publishing. Assigning takes two taps
// from the roster: the slot, then the name. Clashes are shown, never blocked. A note for whoever works it
// (Carly on any shift, a team lead on their group's) is written here too.
import { useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { createShift, removeShift, updateShift } from '@/data'
import type { DateString, Shift, ShiftChange, ShiftType, User } from '@/types'
import type { Roster } from '@/hooks/useRoster'
import { ShiftNotesSection } from '@/components/roster/ShiftNotesSection'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { smallButton } from '@/components/common/listStyles'
import { shortName, formatClock, formatDateShort, formatTime, formatTimeRange } from '@/lib/format'
import { defaultEndTime, localDate } from '@/lib/rules'
import { cn } from '@/lib/utils'

export interface Slot {
  date: DateString
  type: ShiftType
}

interface Props {
  slot: Slot
  shift: Shift | null
  roster: Roster
  onOpenChange: (open: boolean) => void
  onChanged: (message: string) => void
}

const TYPE_LABEL: Record<ShiftType, string> = { morning: 'Morning', night: 'Night' }

/** "Start 7:00 pm → 7:30 pm", "Cleaner Gladys → Angel", "Cancelled". */
function describeChange(c: ShiftChange, nameOf: (id: string) => string): string {
  switch (c.field) {
    case 'assigned_user_id':
      return `${nameOf(c.old_value)} → ${nameOf(c.new_value)}`
    case 'start_time':
      return `Start ${formatTime(c.old_value)} → ${formatTime(c.new_value)}`
    case 'end_time':
      return `End ${formatTime(c.old_value)} → ${formatTime(c.new_value)}`
    case 'date':
      return `Moved from ${formatDateShort(c.old_value)} to ${formatDateShort(c.new_value)}`
    case 'type':
      return `${TYPE_LABEL[c.old_value as ShiftType]} → ${TYPE_LABEL[c.new_value as ShiftType]}`
    case 'status':
      return 'Cancelled'
  }
}

export function ShiftSheet({ slot, shift, roster, onOpenChange, onChanged }: Props) {
  const { me, settings, staff, users, shifts, availability, changes } = roster
  const tz = settings.timezone
  const defaultStart = slot.type === 'morning' ? settings.default_morning_start : settings.default_night_start
  const [start, setStart] = useState(shift?.start_time ?? defaultStart)
  const [end, setEnd] = useState(shift?.end_time ?? defaultEndTime(defaultStart, settings))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const published = shift?.status === 'published'
  const timesDirty = shift !== null && (start !== shift.start_time || end !== shift.end_time)
  const nameOf = (id: string) => shortName(users.find((u) => u.id === id)?.full_name ?? 'Someone')
  const history = shift ? changes.filter((c) => c.shift_id === shift.id) : []
  const label = `${formatDateShort(slot.date)} · ${TYPE_LABEL[slot.type]}`

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key)
    setError(null)
    try {
      const message = await action()
      onChanged(message)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not saved yet. Try again.')
      setConfirmCancel(false)
    } finally {
      setBusy(null)
    }
  }

  function assign(user: User) {
    if (shift?.assigned_user_id === user.id) return
    void run(user.id, async () => {
      if (shift) await updateShift({ shiftId: shift.id, changedBy: me.id, patch: { assigned_user_id: user.id } })
      else await createShift({ date: slot.date, type: slot.type, assignedUserId: user.id, createdBy: me.id, start_time: start, end_time: end })
      return `${shortName(user.full_name)} is on ${label}.`
    })
  }

  function saveTimes() {
    if (!shift) return
    void run('times', async () => {
      await updateShift({ shiftId: shift.id, changedBy: me.id, patch: { start_time: start, end_time: end } })
      return `${label} is now ${formatTimeRange(start, end)}.`
    })
  }

  function remove() {
    if (!shift) return
    if (published && !confirmCancel) return setConfirmCancel(true)
    void run('remove', async () => {
      const { removed } = await removeShift({ shiftId: shift.id, removedBy: me.id })
      return removed === 'cancelled' ? `${label} is cancelled. ${nameOf(shift.assigned_user_id)} won't see it any more.` : `Draft for ${label} removed.`
    })
  }

  const status = !shift ? 'Not on the roster yet. Pick who works it.' : published ? 'Published · staff can see it.' : "Draft · staff can't see it until you publish."

  return (
    <Drawer open onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">{label}</DrawerTitle>
          <DrawerDescription className="text-[15px]">{status}</DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-6">
          {/* The note first, so it's found without scrolling past the staff list. */}
          {shift && shift.status !== 'cancelled' && (
            <ShiftNotesSection
              shift={shift}
              me={me}
              settings={settings}
              onSent={(message) => {
                onChanged(message)
                onOpenChange(false)
              }}
            />
          )}

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Times</legend>
            <div className="flex items-center gap-2">
              <label className="flex-1">
                <span className="sr-only">Start</span>
                <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-12 w-full rounded-xl border border-border bg-background px-3 text-base" />
              </label>
              <span aria-hidden className="text-muted-foreground">–</span>
              <label className="flex-1">
                <span className="sr-only">End</span>
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-12 w-full rounded-xl border border-border bg-background px-3 text-base" />
              </label>
            </div>
            {timesDirty && (
              <button type="button" onClick={saveTimes} disabled={busy !== null || !start || !end} className={`${smallButton.ink} mt-2 w-full gap-2`}>
                {busy === 'times' && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                Save times{published ? ' · staff will see the change' : ''}
              </button>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-medium">{shift ? 'Who works it' : 'Pick who works it'}</legend>
            <ul>
              {staff.map((u) => {
                const away = availability.find((a) => a.user_id === u.id && a.date === slot.date)
                const other = shifts.find((s) => s.date === slot.date && s.type !== slot.type && s.assigned_user_id === u.id)
                const current = shift?.assigned_user_id === u.id
                const notes = [away && `Unavailable${away.note ? ` · ${away.note}` : ''}`, other && `Also on ${TYPE_LABEL[other.type].toLowerCase()}`].filter(Boolean)
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      aria-pressed={current}
                      disabled={busy !== null}
                      onClick={() => assign(u)}
                      className="flex min-h-14 w-full items-center gap-3 border-b border-border px-1 py-2.5 text-left hover:bg-muted/60 active:bg-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-base leading-snug font-medium">{u.full_name}</span>
                        {notes.length > 0 && <span className="block text-sm leading-snug text-warn">{notes.join(' · ')}</span>}
                      </span>
                      {busy === u.id ? (
                        <LoaderCircle aria-hidden className="size-5 shrink-0 animate-spin" />
                      ) : (
                        current && <Check aria-label="On this shift" className="size-5 shrink-0" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </fieldset>

          {history.length > 0 && (
            <section aria-labelledby="shift-history">
              <h3 id="shift-history" className="mb-1 text-sm font-medium">
                Changes since publishing
              </h3>
              <ul>
                {history.map((c) => (
                  <li key={c.id} className="border-b border-border px-1 py-2 text-[15px]">
                    {describeChange(c, nameOf)}
                    <span className="block text-sm text-muted-foreground">
                      {nameOf(c.changed_by)} · {formatDateShort(localDate(c.changed_at, settings))}, {formatClock(c.changed_at, tz)}
                      {c.swap_id ? ' · from a swap' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p aria-live="polite" role="alert" className="text-center text-sm text-warn empty:hidden">
            {error}
          </p>

          {shift && (
            <div>
              {confirmCancel && (
                <p className="mb-2 text-center text-[15px]">
                  {nameOf(shift.assigned_user_id)} can already see this shift. Cancel it? The change is recorded.
                </p>
              )}
              <div className="flex gap-2">
                {confirmCancel && (
                  <button type="button" onClick={() => setConfirmCancel(false)} className={cn(smallButton.outline, 'flex-1')}>
                    Keep it
                  </button>
                )}
                <button type="button" onClick={remove} disabled={busy !== null} className={cn(smallButton.outline, 'flex-1 gap-2 text-warn')}>
                  {busy === 'remove' && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                  {published ? (confirmCancel ? 'Yes, cancel shift' : 'Cancel shift') : 'Delete draft'}
                </button>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
