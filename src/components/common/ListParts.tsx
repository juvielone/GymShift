// Small list primitives shared by the dashboard and team sections: section heading with a count,
// tinted icon disc, and the hairline row. Same look as the cleaner home's status rows.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Section({ title, count, empty, children, id }: { title: string; count?: number; empty: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="mt-6">
      <h2 id={id} className="flex items-center gap-2 px-1 pb-1.5 text-base font-semibold">
        {title}
        {count !== undefined && count > 0 && (
          <span className="min-w-[22px] rounded-full bg-foreground px-1.5 text-center text-[13px] leading-[22px] font-semibold text-background">{count}</span>
        )}
      </h2>
      {count === 0 ? <p className="border-b border-border px-1 py-3 text-[15px] text-muted-foreground">{empty}</p> : <div>{children}</div>}
    </section>
  )
}

export type DiscTone = 'warn' | 'ok' | 'neutral'

const discTone: Record<DiscTone, string> = {
  warn: 'bg-warn-soft text-warn',
  ok: 'bg-ok-soft text-ok',
  neutral: 'bg-muted text-foreground',
}

export function Disc({ tone, children }: { tone: DiscTone; children: ReactNode }) {
  return <span aria-hidden className={cn('flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-[18px]', discTone[tone])}>{children}</span>
}
