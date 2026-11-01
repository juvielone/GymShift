// Add or change a staff member: name, username, role and who they report to. Carly only.
// Adding someone or resetting their PIN shows the new PIN once, to pass on; it can't be looked up later.
// Deactivating never deletes anyone; the confirm step says what it means for shifts and groups.
import { useEffect, useState } from 'react'
import { Check, Copy, LoaderCircle } from 'lucide-react'
import { createUser, getStaffImpact, resetPin, setUserActive, suggestUsername, updateUser } from '@/data'
import type { StaffImpact } from '@/data'
import type { RoleId, User, Uuid } from '@/types'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { firstName } from '@/lib/format'
import { cn } from '@/lib/utils'

const ROLE_CHOICES: { id: RoleId; label: string }[] = [
  { id: 'cleaner', label: 'Cleaner' },
  { id: 'team_lead', label: 'Team lead' },
]

/** "Josh", "Josh and Kyle", "Josh, Kyle and Gino". */
function listNames(people: User[]): string {
  const names = people.map((p) => firstName(p.full_name))
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

const chip = (active: boolean) =>
  cn('min-h-12 rounded-xl border px-3 text-base font-medium transition-colors', active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background active:bg-muted')

const field = 'h-12 w-full rounded-xl border border-border bg-background px-3 text-base'
const inkButton = 'flex h-14 items-center justify-center gap-2 rounded-[14px] bg-foreground text-lg font-semibold text-background active:bg-foreground/85'
const outlineButton = 'flex h-14 items-center justify-center gap-2 rounded-[14px] border border-border text-lg font-medium active:bg-muted'
const quietButton = 'h-11 rounded-xl px-3 text-base font-medium text-muted-foreground active:bg-muted'

/** "482913" → "482 913", easier to read out. */
const groupPin = (pin: string) => `${pin.slice(0, 3)} ${pin.slice(3)}`

interface Reveal {
  name: string
  username: string
  pin: string
  /** The receipt for the staff page once Carly closes the sheet. */
  message: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = add a new person. */
  person: User | null
  users: User[]
  me: User
  onSaved: (message: string) => void
}

export function StaffSheet({ open, onOpenChange, person, users, me, onSaved }: Props) {
  const [name, setName] = useState(person?.full_name ?? '')
  const [username, setUsername] = useState(person?.username ?? '')
  // While adding, the username follows the first name until Carly types her own.
  const [usernameEdited, setUsernameEdited] = useState(person !== null)
  const [role, setRole] = useState<RoleId>(person?.role ?? 'cleaner')
  const [leadId, setLeadId] = useState<Uuid | null>(person?.team_lead_id ?? null)
  const [impact, setImpact] = useState<StaffImpact | null>(null)
  const [step, setStep] = useState<'edit' | 'deactivate' | 'reset'>('edit')
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (person) void getStaffImpact(person.id).then(setImpact)
  }, [person])

  const leads = users.filter((u) => u.role === 'team_lead' && u.active && u.id !== person?.id)
  const managerName = firstName(me.full_name)
  const losesGroup = person?.role === 'team_lead' && role !== 'team_lead' && (impact?.group.length ?? 0) > 0
  const groupLabel = (id: Uuid | null) => (id ? `${firstName(users.find((u) => u.id === id)?.full_name ?? '')}'s group` : `reporting to ${managerName}`)

  // Closing the PIN screen (Done, swipe or tap outside) is when the staff page hears about the change.
  function changeOpen(next: boolean) {
    if (!next && reveal) onSaved(reveal.message)
    onOpenChange(next)
  }

  async function run(action: () => Promise<string | Reveal>) {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (typeof result === 'string') {
        onSaved(result)
        onOpenChange(false)
      } else {
        setReveal(result)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not saved yet. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const details = { full_name: name, username, role, team_lead_id: role === 'cleaner' ? leadId : null }
  const save = () =>
    run(async () => {
      if (!person) {
        const { user: u, pin } = await createUser({ actorId: me.id, ...details })
        const message = `${firstName(u.full_name)} added${u.role === 'cleaner' ? ` to ${groupLabel(u.team_lead_id)}` : ' as a team lead'}.`
        return { name: firstName(u.full_name), username: u.username, pin, message }
      }
      const u = await updateUser({ actorId: me.id, userId: person.id, patch: details })
      return `${firstName(u.full_name)} saved.`
    })
  const toggleActive = () =>
    run(async () => {
      const u = await setUserActive({ actorId: me.id, userId: person!.id, active: !person!.active })
      return u.active ? `${firstName(u.full_name)} is active again.` : `${firstName(u.full_name)} is deactivated. Their hours and records are kept.`
    })
  const newPin = () =>
    run(async () => {
      const { pin } = await resetPin({ actorId: me.id, userId: person!.id })
      const first = firstName(person!.full_name)
      return { name: first, username: person!.username, pin, message: `${first} has a new PIN.` }
    })

  async function copyPin() {
    if (!reveal) return
    try {
      await navigator.clipboard.writeText(`GymShift sign-in\nName: ${reveal.username}\nPIN: ${reveal.pin}`)
      setCopied(true)
    } catch {
      setError("Couldn't copy. Write the PIN down instead.")
    }
  }

  const first = person ? firstName(person.full_name) : ''
  const title = reveal
    ? `${reveal.name}'s PIN`
    : step === 'deactivate'
      ? `Deactivate ${first}?`
      : step === 'reset'
        ? `Reset ${first}'s PIN?`
        : (person?.full_name ?? 'Add person')
  const description = reveal
    ? `Shown only now. Tell ${reveal.name} in person or send it by message.`
    : step === 'deactivate'
      ? "They won't be able to sign in or be put on the roster. Their hours, photos and notes are kept."
      : step === 'reset'
        ? "Their old PIN stops working. You'll see the new PIN once, to pass on."
        : person && !person.active
          ? 'No longer active. Their hours and records are kept.'
          : 'Only you can add people or change roles.'

  return (
    <Drawer open={open} onOpenChange={changeOpen}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">{title}</DrawerTitle>
          <DrawerDescription className="text-[15px]">{description}</DrawerDescription>
        </DrawerHeader>

        {reveal ? (
          <div className="mx-4 rounded-[18px] border border-border px-4 py-5 text-center">
            <p className="text-[13px] font-medium text-muted-foreground">PIN</p>
            <p className="mt-1 text-[34px] leading-tight font-semibold tracking-[0.12em] tabular-nums">{groupPin(reveal.pin)}</p>
            <p className="mt-3 text-[15px] text-muted-foreground">
              Name to type: <span className="font-semibold text-foreground">{reveal.username}</span>
            </p>
          </div>
        ) : step === 'deactivate' && impact ? (
          <ul className="mx-4 space-y-2 text-[15px] leading-snug">
            {impact.upcomingShifts > 0 && (
              <li className="rounded-xl bg-warn-soft px-3 py-2.5 text-warn">
                They're on {impact.upcomingShifts} upcoming {impact.upcomingShifts === 1 ? 'shift' : 'shifts'}. Change {impact.upcomingShifts === 1 ? 'it' : 'them'} in the roster.
              </li>
            )}
            {impact.clockedIn && <li className="rounded-xl bg-warn-soft px-3 py-2.5 text-warn">They're clocked in now. Their time is still saved.</li>}
            {impact.group.length > 0 && <li className="rounded-xl bg-muted px-3 py-2.5">{listNames(impact.group)} will report to {managerName}.</li>}
          </ul>
        ) : step === 'reset' ? null : (
          <div className="space-y-5 overflow-y-auto px-4 pb-2">
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">Full name</span>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (!usernameEdited) setUsername(suggestUsername(e.target.value))
                  }}
                  autoComplete="off"
                  className={`${field} mt-1`}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">Username</span>
                <input
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value.toLowerCase())
                    setUsernameEdited(true)
                  }}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={`${field} mt-1`}
                />
                <span className="mt-1 block text-sm text-muted-foreground">They type this to sign in, with their PIN.</span>
              </label>
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-muted-foreground">Role</legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {ROLE_CHOICES.map((r) => (
                  <button key={r.id} type="button" aria-pressed={role === r.id} onClick={() => setRole(r.id)} className={chip(role === r.id)}>
                    {r.label}
                  </button>
                ))}
              </div>
              {role === 'team_lead' && <p className="mt-1.5 text-sm text-muted-foreground">Can roster and approve swaps for everyone, and sees their own group's records.</p>}
            </fieldset>

            {role === 'cleaner' && (
              <fieldset>
                <legend className="text-sm font-medium text-muted-foreground">Reports to</legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {leads.map((l) => (
                    <button key={l.id} type="button" aria-pressed={leadId === l.id} onClick={() => setLeadId(l.id)} className={chip(leadId === l.id)}>
                      {firstName(l.full_name)}
                    </button>
                  ))}
                  <button type="button" aria-pressed={leadId === null} onClick={() => setLeadId(null)} className={chip(leadId === null)}>
                    {managerName}
                  </button>
                </div>
              </fieldset>
            )}

            {losesGroup && impact && (
              <p className="rounded-xl bg-muted px-3 py-2.5 text-[15px] leading-snug">
                {listNames(impact.group)} will report to {managerName}.
              </p>
            )}
          </div>
        )}

        <DrawerFooter>
          {error && (
            <p role="alert" className="text-center text-[15px] font-medium text-warn">
              {error}
            </p>
          )}
          {reveal ? (
            <>
              <button type="button" onClick={() => void copyPin()} className={inkButton}>
                {copied ? <Check aria-hidden className="size-5" /> : <Copy aria-hidden className="size-5" />}
                {copied ? 'Copied' : 'Copy name and PIN'}
              </button>
              <button type="button" onClick={() => changeOpen(false)} className={outlineButton}>
                Done
              </button>
            </>
          ) : step === 'deactivate' ? (
            <>
              <button type="button" onClick={() => void toggleActive()} disabled={busy} className={inkButton}>
                {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
                Deactivate
              </button>
              <button type="button" onClick={() => setStep('edit')} className={outlineButton}>
                Keep {first}
              </button>
            </>
          ) : step === 'reset' ? (
            <>
              <button type="button" onClick={() => void newPin()} disabled={busy} className={inkButton}>
                {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
                Reset PIN
              </button>
              <button type="button" onClick={() => setStep('edit')} className={outlineButton}>
                Keep current PIN
              </button>
            </>
          ) : (
            <>
              {!person && <p className="text-center text-sm text-muted-foreground">You'll get a PIN to give them.</p>}
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || !name.trim() || !username.trim()}
                className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press disabled:bg-muted disabled:text-muted-foreground"
              >
                {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
                {person ? 'Save' : 'Add person'}
              </button>
              {person && (
                <div className="flex justify-center gap-2">
                  {person.active && (
                    <button type="button" onClick={() => setStep('reset')} disabled={busy} className={quietButton}>
                      Reset PIN
                    </button>
                  )}
                  <button type="button" onClick={() => (person.active ? setStep('deactivate') : void toggleActive())} disabled={busy} className={quietButton}>
                    {person.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              )}
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
