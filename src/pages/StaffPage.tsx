// Carly's staff list, grouped the way the team works: leads, each team lead's group, people who
// report to Carly, then anyone no longer active. Tap a person to change them; nobody is ever deleted.
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { getCurrentUser, getRoles, getUsers } from '@/data'
import type { RoleId, User } from '@/types'
import { Disc } from '@/components/common/ListParts'
import { rowClass, smallButton } from '@/components/common/listStyles'
import { StaffSheet } from '@/components/manager/StaffSheet'
import { shortName } from '@/lib/format'
import { cn } from '@/lib/utils'

type Data = { me: User; users: User[]; roleLabel: Record<RoleId, string> }

const byName = (a: User, b: User) => a.full_name.localeCompare(b.full_name)

export function StaffPage({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [sheet, setSheet] = useState<{ person: User | null } | null>(null)
  const [receipt, setReceipt] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const load = useCallback(async () => {
    const [me, users, roles] = await Promise.all([getCurrentUser(), getUsers(), getRoles()])
    setData({ me, users, roleLabel: Object.fromEntries(roles.map((r) => [r.id, r.label])) as Record<RoleId, string> })
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!data) {
    return (
      <main className="mx-auto max-w-[480px] px-4 pt-16" role="status" aria-label="Loading">
        <div className="h-7 w-24 rounded-md bg-muted" />
        <div className="mt-6 h-48 rounded-[18px] bg-muted motion-safe:animate-pulse" />
      </main>
    )
  }

  const { me, users, roleLabel } = data
  const active = users.filter((u) => u.active)
  const inactive = users.filter((u) => !u.active).sort(byName)
  const leads = active.filter((u) => u.role === 'team_lead').sort(byName)
  const cleaners = active.filter((u) => u.role === 'cleaner')
  // The group heading already says who they report to, so a row only needs the role.
  const detail = (u: User) => (u.id === me.id ? `${roleLabel[u.role]} · you` : roleLabel[u.role])

  const groups: { id: string; title: string; people: User[] }[] = [
    { id: 'leads', title: 'Manager and team leads', people: [me, ...leads] },
    ...leads.map((l) => ({ id: l.id, title: `${shortName(l.full_name)}'s group`, people: cleaners.filter((c) => c.team_lead_id === l.id).sort(byName) })),
    { id: 'direct', title: `Reports to ${shortName(me.full_name)}`, people: cleaners.filter((c) => c.team_lead_id === null).sort(byName) },
  ].filter((g) => g.people.length > 0)

  const row = (u: User) => {
    const body = (
      <>
        <Disc tone="neutral">
          <span className="text-[15px] font-semibold">{u.full_name[0]}</span>
        </Disc>
        <span className="min-w-0 flex-1">
          <span className="block text-base leading-snug font-medium">{u.full_name}</span>
          <span className="block text-sm leading-snug text-muted-foreground">{u.active ? detail(u) : `${roleLabel[u.role]} · no longer active`}</span>
        </span>
      </>
    )
    // The manager's own account isn't edited here, so it can't lock itself out.
    return u.id === me.id ? (
      <div className={`${rowClass} min-h-14 items-center`}>{body}</div>
    ) : (
      <button type="button" onClick={() => setSheet({ person: u })} className={`${rowClass} min-h-14 items-center hover:bg-muted/60 active:bg-muted`}>
        {body}
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      </button>
    )
  }

  return (
    <main className="mx-auto min-h-svh max-w-[480px] px-4 pb-12">
      <header className="flex h-12 items-center">
        <button type="button" onClick={onBack} className="-ml-2 flex h-11 items-center gap-1 rounded-xl px-2 text-[15px] font-medium hover:bg-muted active:bg-muted">
          <ChevronLeft aria-hidden className="size-5" />
          Back
        </button>
      </header>

      <div className="flex items-end justify-between gap-3 px-1 pt-1">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.01em]">Staff</h1>
          <p className="mt-0.5 text-[15px] text-muted-foreground">
            {active.length} active · tap someone to change them
          </p>
        </div>
        <button type="button" onClick={() => setSheet({ person: null })} className={`${smallButton.ink} gap-1.5`}>
          <Plus aria-hidden className="size-[18px]" />
          Add person
        </button>
      </div>

      <div aria-live="polite" className="empty:hidden">
        {receipt && <p className="mt-4 rounded-2xl bg-ok-soft px-4 py-3 text-[15px] font-medium">{receipt}</p>}
      </div>

      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`grp-${g.id}`}>
          <h2 id={`grp-${g.id}`} className="px-1 pt-5 pb-0.5 text-[13px] font-medium text-muted-foreground">
            {g.title}
          </h2>
          <ul>
            {g.people.map((u) => (
              <li key={u.id}>{row(u)}</li>
            ))}
          </ul>
        </section>
      ))}

      {inactive.length > 0 && (
        <section className="mt-5">
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            aria-expanded={showInactive}
            className="flex min-h-11 w-full items-center justify-between px-1 text-[13px] font-medium text-muted-foreground"
          >
            No longer active · {inactive.length}
            <ChevronDown aria-hidden className={cn('size-4 transition-transform duration-300 motion-reduce:transition-none', showInactive && 'rotate-180')} />
          </button>
          {showInactive && (
            <ul>
              {inactive.map((u) => (
                <li key={u.id}>{row(u)}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {sheet && (
        <StaffSheet
          key={sheet.person?.id ?? 'new'}
          open
          onOpenChange={(o) => !o && setSheet(null)}
          person={sheet.person}
          users={users}
          me={me}
          onSaved={(msg) => {
            setReceipt(msg)
            void load()
          }}
        />
      )}
    </main>
  )
}
