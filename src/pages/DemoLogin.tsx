// Demo login: one tap signs in as Carly, Gladys or Josh so the client can see each role's screens.
// Mock only. Replaced by Supabase auth (magic link / password) later.
import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { getDemoAccounts, getRoles, getSettings } from '@/data'
import type { RoleId, User, Uuid } from '@/types'
import { siteShortName } from '@/lib/format'

const WHAT_YOU_SEE: Record<RoleId, string> = {
  manager: "Approvals, flags, today's shifts and hours export.",
  team_lead: 'Own shifts plus swap approvals for the team.',
  cleaner: 'Clock in and out, ask for extra time, next shifts.',
}

export function DemoLogin({ onSignIn }: { onSignIn: (id: Uuid) => void }) {
  const [accounts, setAccounts] = useState<User[]>([])
  const [roleLabels, setRoleLabels] = useState<Partial<Record<RoleId, string>>>({})
  const [site, setSite] = useState('')

  useEffect(() => {
    void (async () => {
      const [users, roles, settings] = await Promise.all([getDemoAccounts(), getRoles(), getSettings()])
      setAccounts(users)
      setRoleLabels(Object.fromEntries(roles.map((r) => [r.id, r.label])))
      setSite(siteShortName(settings.site_name))
    })()
  }, [])

  return (
    <main className="mx-auto flex min-h-svh max-w-[480px] flex-col px-4 pb-10">
      <header className="flex h-12 items-center px-1">
        <p className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold tracking-[0.08em] uppercase">World Gym</span>
          <span className="text-[15px] text-muted-foreground">{site}</span>
        </p>
      </header>

      <div className="px-1 pt-10">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.01em]">GymShift</h1>
        <p className="mt-0.5 text-[15px] text-muted-foreground">Demo: choose who to sign in as.</p>
      </div>

      <ul className="mt-6 space-y-3">
        {accounts.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => onSignIn(u.id)}
              className="flex min-h-[72px] w-full items-center gap-3 rounded-[18px] border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-muted/60 active:bg-muted"
            >
              <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold">
                {u.full_name[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold">
                  {u.full_name} <span className="font-normal text-muted-foreground">· {roleLabels[u.role] ?? u.role}</span>
                </span>
                <span className="block text-[15px] leading-snug text-muted-foreground">{WHAT_YOU_SEE[u.role]}</span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-auto pt-10 text-center text-sm text-muted-foreground">Demo data. Changes reset when the page reloads.</p>
    </main>
  )
}
