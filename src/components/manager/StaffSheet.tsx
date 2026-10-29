// Add or change a staff member: name, email, role and who they report to. Carly only.
// Deactivating never deletes anyone; the confirm step says what it means for shifts and groups.
import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { createUser, getStaffImpact, setUserActive, updateUser } from '@/data'
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
  const [email, setEmail] = useState(person?.email ?? '')
  const [role, setRole] = useState<RoleId>(person?.role ?? 'cleaner')
  const [leadId, setLeadId] = useState<Uuid | null>(person?.team_lead_id ?? null)
  const [impact, setImpact] = useState<StaffImpact | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (person) void getStaffImpact(person.id).then(setImpact)
  }, [person])

  const leads = users.filter((u) => u.role === 'team_lead' && u.active && u.id !== person?.id)
  const managerName = firstName(me.full_name)
  const losesGroup = person?.role === 'team_lead' && role !== 'team_lead' && (impact?.group.length ?? 0) > 0
  const groupLabel = (id: Uuid | null) => (id ? `${firstName(users.find((u) => u.id === id)?.full_name ?? '')}'s group` : `reporting to ${managerName}`)

  async function run(action: () => Promise<string>) {
    setBusy(true)
    setError(null)
    try {
      onSaved(await action())
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not saved yet. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const details = { full_name: name, email, role, team_lead_id: role === 'cleaner' ? leadId : null }
  const save = () =>
    run(async () => {
      if (!person) {
        const u = await createUser({ actorId: me.id, ...details })
        return `${firstName(u.full_name)} added${u.role === 'cleaner' ? ` to ${groupLabel(u.team_lead_id)}` : ' as a team lead'}.`
      }
      const u = await updateUser({ actorId: me.id, userId: person.id, patch: details })
      return `${firstName(u.full_name)} saved.`
    })
  const toggleActive = () =>
    run(async () => {
      const u = await setUserActive({ actorId: me.id, userId: person!.id, active: !person!.active })
      return u.active ? `${firstName(u.full_name)} is active again.` : `${firstName(u.full_name)} is deactivated. Their hours and records are kept.`
    })

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">{person ? (confirming ? `Deactivate ${firstName(person.full_name)}?` : person.full_name) : 'Add person'}</DrawerTitle>
          <DrawerDescription className="text-[15px]">
            {confirming
              ? "They won't be able to sign in or be put on the roster. Their hours, photos and notes are kept."
              : person && !person.active
                ? 'No longer active. Their hours and records are kept.'
                : 'Only you can add people or change roles.'}
          </DrawerDescription>
        </DrawerHeader>

        {confirming && impact ? (
          <ul className="mx-4 space-y-2 text-[15px] leading-snug">
            {impact.upcomingShifts > 0 && (
              <li className="rounded-xl bg-warn-soft px-3 py-2.5 text-warn">
                They're on {impact.upcomingShifts} upcoming {impact.upcomingShifts === 1 ? 'shift' : 'shifts'}. Change {impact.upcomingShifts === 1 ? 'it' : 'them'} in the roster.
              </li>
            )}
            {impact.clockedIn && <li className="rounded-xl bg-warn-soft px-3 py-2.5 text-warn">They're clocked in now. Their time is still saved.</li>}
            {impact.group.length > 0 && <li className="rounded-xl bg-muted px-3 py-2.5">{listNames(impact.group)} will report to {managerName}.</li>}
          </ul>
        ) : (
          <div className="space-y-5 overflow-y-auto px-4 pb-2">
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">Full name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className={`${field} mt-1`} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">Email</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="off" className={`${field} mt-1`} />
                <span className="mt-1 block text-sm text-muted-foreground">They'll use this to sign in.</span>
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
          {confirming ? (
            <>
              <button type="button" onClick={() => void toggleActive()} disabled={busy} className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-foreground text-lg font-semibold text-background active:bg-foreground/85">
                {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
                Deactivate
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="h-14 rounded-[14px] border border-border text-lg font-medium active:bg-muted">
                Keep {person ? firstName(person.full_name) : ''}
              </button>
            </>
          ) : (
            <>
              {!person && <p className="text-center text-sm text-muted-foreground">When the app goes live, they'll get an email to sign in.</p>}
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || !name.trim() || !email.trim()}
                className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-colors active:bg-brand-press disabled:bg-muted disabled:text-muted-foreground"
              >
                {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
                {person ? 'Save' : 'Add person'}
              </button>
              {person && (
                <button
                  type="button"
                  onClick={() => (person.active ? setConfirming(true) : void toggleActive())}
                  disabled={busy}
                  className="h-11 rounded-xl text-base font-medium text-muted-foreground active:bg-muted"
                >
                  {person.active ? 'Deactivate' : 'Reactivate'}
                </button>
              )}
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
