// Entry row to past shifts: "Shift records" for Carly and Gladys, "My past shifts" for a cleaner.
// Same outlined row as Roster and Fortnight hours.
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function RecordsRow({ own, onOpen, className }: { own: boolean; onOpen: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('flex min-h-14 w-full items-center justify-between gap-3 rounded-[14px] border border-border px-4 py-3 text-left hover:bg-muted/60 active:bg-muted', className)}
    >
      <span>
        <span className="block text-base font-semibold">{own ? 'My past shifts' : 'Shift records'}</span>
        <span className="block text-sm text-muted-foreground">{own ? 'Your times, hours and photos' : 'Times, photos and notes for each shift'}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </button>
  )
}
