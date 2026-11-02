// Add or change a staff member: name, username, role, who they report to and an optional mobile. Carly only.
// Adding, resetting or reactivating someone takes a PIN: the app fills one in and Carly can type her own.
// It's shown once afterwards, to pass on; it can't be looked up later.
// Deactivating never deletes anyone; the confirm step says what it means for shifts and groups.
import { useEffect, useState } from 'react'
import { Check, Copy, LoaderCircle, RefreshCw } from 'lucide-react'
import { createUser, getContact, getStaffImpact, makePin, pinProblem, resetPin, setUserActive, suggestUsername, updateUser } from '@/data'
import type { StaffImpact } from '@/data'
import type { RoleId, User, Uuid } from '@/types'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { formatPhone, shortName } from '@/lib/format'
import { cn } from '@/lib/utils'

const ROLE_CHOICES: { id: RoleId; label: string }[] = [
  { id: 'cleaner', label: 'Cleaner' },
  { id: 'team_lead', label: 'Team lead' },
]

/** "Josh", "Josh and Kyle", "Josh, Kyle and Gino". */
function listNames(people: User[]): string {
  const names = people.map((p) => shortName(p.full_name))
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

const chip = (active: boolean) =>
  cn('min-h-12 rounded-xl border px-3 text-base font-medium transition-colors', active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background active:bg-muted')

const field = 'h-12 w-full rounded-xl border border-border bg-background px-3 text-base'
const inkButton = 'flex h-14 items-center justify-center gap-2 rounded-[14px] bg-foreground text-lg font-semibold text-background active:bg-foreground/85 disabled:bg-muted disabled:text-muted-foreground'
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
  const [phone, setPhone] = useState('')
  // Filled in for Carly; she can keep it or type her own.
  const [pin, setPin] = useState(() => makePin())
  const [impact, setImpact] = useState<StaffImpact | null>(null)
  const [step, setStep] = useState<'edit' | 'deactivate' | 'reset' | 'reactivate'>('edit')
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!person) return
    void getStaffImpact(person.id).then(setImpact)
    void getContact({ viewerId: me.id, userId: person.id }).then((c) => setPhone(c?.phone ? formatPhone(c.phone) : ''))
  }, [person, me.id])

  const pinError = pin.length === 6 ? pinProblem(pin) : null
  const pinReady = pin.length === 6 && pinError === null
  const openPinStep = (next: 'reset' | 'reactivate') => {
    setPin(makePin())
    setError(null)
    setStep(next)
  }

  const leads = users.filter((u) => u.role === 'team_lead' && u.active && u.id !== person?.id)
  const managerName = shortName(me.full_name)
  const losesGroup = person?.role === 'team_lead' && role !== 'team_lead' && (impact?.group.length ?? 0) > 0
  const groupLabel = (id: Uuid | null) => (id ? `${shortName(users.find((u) => u.id === id)?.full_name ?? '')}'s group` : `reporting to ${managerName}`)

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

  const details = { full_name: name, username, role, team_lead_id: role === 'cleaner' ? leadId : null, phone: phone.trim() || null }
  const save = () =>
    run(async () => {
      if (!person) {
        const { user: u, pin: given } = await createUser({ actorId: me.id, ...details, pin })
        const message = `${shortName(u.full_name)} added${u.role === 'cleaner' ? ` to ${groupLabel(u.team_lead_id)}` : ' as a team lead'}.`
        return { name: shortName(u.full_name), username: u.username, pin: given, message }
      }
      const u = await updateUser({ actorId: me.id, userId: person.id, patch: details })
      return `${shortName(u.full_name)} saved.`
    })
  const deactivate = () =>
    run(async () => {
      const u = await setUserActive({ actorId: me.id, userId: person!.id, active: false })
      return `${shortName(u.full_name)} is deactivated. Their hours and records are kept.`
    })
  // Coming back: active again with a new PIN, in one step.
  const reactivate = () =>
    run(async () => {
      const u = await setUserActive({ actorId: me.id, userId: person!.id, active: true })
      const { pin: given } = await resetPin({ actorId: me.id, userId: u.id, pin })
      const first = shortName(u.full_name)
      return { name: first, username: u.username, pin: given, message: `${first} is active again, with a new PIN.` }
    })
  const newPin = () =>
    run(async () => {
      const { pin: given } = await resetPin({ actorId: me.id, userId: person!.id, pin })
      const first = shortName(person!.full_name)
      return { name: first, username: person!.username, pin: given, message: `${first} has a new PIN.` }
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

  const first = person ? shortName(person.full_name) : ''
  const title = reveal
    ? `${reveal.name}'s PIN`
    : step === 'deactivate'
      ? `Deactivate ${first}?`
      : step === 'reset'
        ? `Reset ${first}'s PIN?`
        : step === 'reactivate'
          ? `Reactivate ${first}?`
          : (person?.full_name ?? 'Add person')
  const description = reveal
    ? `Shown only now. Tell ${reveal.name} in person or send it by message.`
    : step === 'deactivate'
      ? "They won't be able to sign in or be put on the roster. Their hours, photos and notes are kept."
      : step === 'reset'
        ? 'Their old PIN stops working. Keep this new one or type your own.'
        : step === 'reactivate'
          ? 'They can sign in and be rostered again, with a new PIN. Keep this one or type your own.'
          : person && !person.active
            ? 'No longer active. Their hours and records are kept.'
            : 'Only you can add people or change roles.'

  const pinField = (
    <div className="block">
      <label htmlFor="staff-pin" className="text-sm font-medium text-muted-foreground">
        PIN
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="staff-pin"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={pinError !== null}
          aria-describedby="staff-pin-hint"
          className={cn(field, 'flex-1 text-lg font-semibold tracking-[0.12em] tabular-nums')}
        />
        <button type="button" onClick={() => setPin(makePin())} aria-label="Make a new PIN" className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border active:bg-muted">
          <RefreshCw aria-hidden className="size-5" />
        </button>
      </div>
      <span id="staff-pin-hint" className={cn('mt-1 block text-sm', pinError ? 'font-medium text-warn' : 'text-muted-foreground')}>
        {pinError ?? (pin.length < 6 ? '6 digits.' : 'Keep this one or type your own. You’ll see it once more after saving.')}
      </span>
    </div>
  )

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
        ) : step === 'reset' || step === 'reactivate' ? (
          <div className="px-4">{pinField}</div>
        ) : (
          <div className="space-y-5 overflow-y-auto px-4 pb-2">
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">Full name</span>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (!usernameEdited) setUsername(suggestUsername(e.target.value, users.filter((u) => u.id !== person?.id).map((u) => u.username)))
                  }}
                  autoComplete="off"
                  className={`${field} mt-1`}
                />
                <span className="mt-1 block text-sm text-muted-foreground">First name and surname, so two people with the same first name can be told apart.</span>
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
              {!person && pinField}
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">Mobile (optional)</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="0412 345 678"
                  className={`${field} mt-1`}
                />
                <span className="mt-1 block text-sm text-muted-foreground">To contact them. Only you and they can see it. Not used to sign in.</span>
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
                      {shortName(l.full_name)}
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
              <button type="button" onClick={() => void deactivate()} disabled={busy} className={inkButton}>
                {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
                Deactivate
              </button>
              <button type="button" onClick={() => setStep('edit')} className={outlineButton}>
                Keep {first}
              </button>
            </>
          ) : step === 'reset' || step === 'reactivate' ? (
            <>
              <button type="button" onClick={() => void (step === 'reset' ? newPin() : reactivate())} disabled={busy || !pinReady} className={inkButton}>
                {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
                {step === 'reset' ? 'Reset PIN' : 'Reactivate'}
              </button>
              <button type="button" onClick={() => setStep('edit')} className={outlineButton}>
                {step === 'reset' ? 'Keep current PIN' : 'Cancel'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || !name.trim() || !username.trim() || (!person && !pinReady)}
                className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press disabled:bg-muted disabled:text-muted-foreground"
              >
                {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
                {person ? 'Save' : 'Add person'}
              </button>
              {person && (
                <div className="flex justify-center gap-2">
                  {person.active && (
                    <button type="button" onClick={() => openPinStep('reset')} disabled={busy} className={quietButton}>
                      Reset PIN
                    </button>
                  )}
                  <button type="button" onClick={() => (person.active ? setStep('deactivate') : openPinStep('reactivate'))} disabled={busy} className={quietButton}>
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
