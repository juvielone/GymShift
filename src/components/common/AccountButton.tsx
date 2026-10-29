// Header avatar. Tapping it returns to the demo login to pick another role.
export function AccountButton({ name, onSignOut }: { name: string; onSignOut: () => void }) {
  return (
    <button
      type="button"
      onClick={onSignOut}
      aria-label={`${name}. Switch user`}
      title="Switch user"
      className="flex size-9 items-center justify-center rounded-full bg-muted text-[15px] font-semibold hover:bg-border/60 active:bg-border"
    >
      {name[0]}
    </button>
  )
}
