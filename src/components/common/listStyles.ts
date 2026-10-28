// Class strings shared by list rows and their small inline buttons (kept out of component files for fast refresh).

export const rowClass = 'flex w-full gap-3 border-b border-border px-1 py-3 text-left'

export const smallButton = {
  ink: 'inline-flex h-11 items-center justify-center rounded-xl bg-foreground px-4 text-[15px] font-semibold text-background transition-colors active:bg-foreground/85 disabled:bg-muted disabled:text-muted-foreground',
  outline: 'inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-[15px] font-semibold transition-colors active:bg-muted disabled:text-muted-foreground',
}
