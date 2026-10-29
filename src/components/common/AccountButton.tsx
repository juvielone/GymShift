// Header avatar. Tapping it opens the account sheet: who is signed in, the manager's "Manage" rows
// (setup that isn't daily, e.g. gym location), and Log out. Log out returns to the demo login for now.
import { useState, type ReactNode } from 'react'
import { ChevronRight, LogOut } from 'lucide-react'
import { getPermissions } from '@/data'
import type { Uuid } from '@/types'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Disc } from '@/components/common/ListParts'
import { rowClass } from '@/components/common/listStyles'

export interface ManageItem {
  id: string
  icon: ReactNode
  title: string
  detail: string
  onSelect: () => void
}

interface Props {
  userId: Uuid
  name: string
  siteName: string
  onSignOut: () => void
  /** Manager-only setup rows. Omit for everyone else. */
  manage?: ManageItem[]
}

export function AccountButton({ userId, name, siteName, onSignOut, manage }: Props) {
  const [open, setOpen] = useState(false)
  const [roleLabel, setRoleLabel] = useState<string | null>(null)

  function show() {
    setOpen(true)
    if (!roleLabel) void getPermissions(userId).then((r) => setRoleLabel(r.label))
  }

  // Close this sheet first so the next one doesn't open on top of it.
  function select(item: ManageItem) {
    setOpen(false)
    window.setTimeout(item.onSelect, 200)
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={`${name}. Account`}
        aria-haspopup="dialog"
        className="flex size-11 items-center justify-center rounded-full"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-muted text-[15px] font-semibold hover:bg-border/60 active:bg-border">{name[0]}</span>
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="mx-auto max-w-[480px]">
          <DrawerHeader className="flex-row items-center gap-3 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold">
              {name[0]}
            </span>
            <span className="min-w-0">
              <DrawerTitle className="text-xl font-semibold">{name}</DrawerTitle>
              <DrawerDescription className="text-[15px]">
                {roleLabel ? `${roleLabel} · ` : ''}
                {siteName}
              </DrawerDescription>
            </span>
          </DrawerHeader>

          {manage && manage.length > 0 && (
            <section aria-labelledby="manage-title" className="px-4">
              <h3 id="manage-title" className="px-1 pt-2 pb-0.5 text-[13px] font-medium text-muted-foreground">
                Manage
              </h3>
              <ul>
                {manage.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => select(item)} className={`${rowClass} min-h-14 items-center hover:bg-muted/60 active:bg-muted`}>
                      <Disc tone="neutral">{item.icon}</Disc>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base leading-snug font-medium">{item.title}</span>
                        <span className="block text-sm leading-snug text-muted-foreground">{item.detail}</span>
                      </span>
                      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <DrawerFooter>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onSignOut()
              }}
              className="flex h-14 items-center justify-center gap-2 rounded-[14px] border border-border text-lg font-medium active:bg-muted"
            >
              <LogOut aria-hidden className="size-5" />
              Log out
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  )
}
