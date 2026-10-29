// Entry row to the roster, for anyone whose role can roster (Carly, and Gladys on Carly's behalf).
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function RosterRow({ onOpen, className }: { onOpen: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('flex min-h-14 w-full items-center justify-between gap-3 rounded-[14px] border border-border px-4 py-3 text-left hover:bg-muted/60 active:bg-muted', className)}
    >
      <span>
        <span className="block text-base font-semibold">Roster</span>
        <span className="block text-sm text-muted-foreground">Build, publish and change the fortnight</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </button>
  )
}
