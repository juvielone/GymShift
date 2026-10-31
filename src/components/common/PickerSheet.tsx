// Choose one from a list, in the app's own bottom sheet instead of the browser's dropdown:
// hairline rows, an optional disc, a quiet detail on the right and an ink tick on the current choice.
// One tap picks and closes. Used for the person and fortnight on the records screen.
import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { cn } from '@/lib/utils'

export interface PickerOption {
  value: string
  label: string
  /** Quiet right-hand detail, e.g. "2 shifts" or "12 – 25 Oct". */
  detail?: string
  /** Optional disc content (an initial or icon). */
  disc?: ReactNode
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  options: PickerOption[]
  value: string
  onPick: (value: string) => void
}

export function PickerSheet({ open, onOpenChange, title, description, options, value, onPick }: Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-xl font-semibold">{title}</DrawerTitle>
          {description && <DrawerDescription className="text-[15px]">{description}</DrawerDescription>}
        </DrawerHeader>
        <ul aria-label={title} className="overflow-y-auto px-4 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin] pb-[calc(env(safe-area-inset-bottom)+16px)]">
          {options.map((o) => {
            const selected = o.value === value
            return (
              <li key={o.value}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    onPick(o.value)
                    onOpenChange(false)
                  }}
                  className="flex min-h-14 w-full items-center gap-3 border-b border-border px-1 py-2.5 text-left transition-colors hover:bg-muted/60 active:bg-muted"
                >
                  {o.disc && (
                    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-[15px] font-semibold [&_svg]:size-[18px]">
                      {o.disc}
                    </span>
                  )}
                  <span className={cn('min-w-0 flex-1 text-base', selected ? 'font-semibold' : 'font-medium')}>{o.label}</span>
                  {o.detail && <span className="shrink-0 text-sm text-muted-foreground">{o.detail}</span>}
                  <span className="flex size-6 shrink-0 items-center justify-center">
                    {selected && <Check aria-hidden className="size-5" strokeWidth={2.5} />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </DrawerContent>
    </Drawer>
  )
}
