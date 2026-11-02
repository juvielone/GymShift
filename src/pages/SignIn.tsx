// Sign in: typed username plus a 6-digit PIN on a time-clock keypad that signs in on the last digit.
// Carly switches to a password on the same screen. Staff names are never listed (PRD F1), except
// the mock-only demo accounts helper, which goes away with Supabase auth.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Delete, LoaderCircle } from 'lucide-react'
import { getDataMode, getDemoAccounts, getSettings, resetTrialData, signIn, SIGN_IN_MISMATCH, type DataMode, type DemoAccount } from '@/data'
import { shortName, siteShortName } from '@/lib/format'
import { cn } from '@/lib/utils'

const PIN_LENGTH = 6
const LAST_NAME_KEY = 'gymshift.lastUsername'

// The last username on this phone is a per-phone convenience, so a signed-out person only types the PIN.
function rememberedName(): string {
  try {
    return localStorage.getItem(LAST_NAME_KEY) ?? ''
  } catch {
    return ''
  }
}
function rememberName(name: string) {
  try {
    localStorage.setItem(LAST_NAME_KEY, name)
  } catch {
    // Storage blocked: they type their name next time.
  }
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'delete'] as const

const field = 'h-12 w-full rounded-[14px] border border-border bg-background px-3.5 text-lg font-semibold outline-none focus-visible:border-foreground'
const textButton = 'h-11 rounded-[14px] px-1 text-base font-medium underline underline-offset-[3px] active:bg-muted'

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'pin' | 'password'>('pin')
  const [name, setName] = useState(rememberedName)
  const [pin, setPin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [site, setSite] = useState('')
  const [dataMode, setDataMode] = useState<DataMode | null>(null)
  const [demo, setDemo] = useState<DemoAccount[]>([])
  const [confirmReset, setConfirmReset] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void Promise.all([getSettings(), getDataMode(), getDemoAccounts()]).then(([settings, m, accounts]) => {
      setSite(siteShortName(settings.site_name))
      setDataMode(m)
      setDemo(accounts)
    })
  }, [])

  const submit = useCallback(
    async (username: string, secret: string, as: 'pin' | 'password') => {
      if (!username.trim()) {
        setError('Type your name first.')
        setPin('')
        nameRef.current?.focus()
        return
      }
      setBusy(true)
      setError(null)
      try {
        await signIn({ username, secret })
        rememberName(username.trim().toLowerCase())
        onSignedIn()
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Not signed in yet. Try again.'
        setError(message === SIGN_IN_MISMATCH && as === 'password' ? "That name and password don't match." : message)
        setPin('')
        setShake((k) => k + 1)
        setBusy(false)
      }
    },
    [onSignedIn],
  )

  const press = useCallback(
    (key: string) => {
      if (busy) return
      if (key === 'delete') return setPin(pin.slice(0, -1))
      if (pin.length >= PIN_LENGTH) return
      const next = pin + key
      setError(null)
      setPin(next)
      if (next.length === PIN_LENGTH) void submit(name, next, 'pin')
    },
    [busy, pin, name, submit],
  )

  // A laptop keyboard types into the PIN too, unless the name field has focus.
  useEffect(() => {
    if (mode !== 'pin') return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') press('delete')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, press])

  function switchMode(next: 'pin' | 'password') {
    setMode(next)
    setPin('')
    setPassword('')
    setError(null)
  }

  function signInAs(account: DemoAccount) {
    const as = account.role === 'manager' ? 'password' : 'pin'
    setName(account.username)
    setMode(as)
    if (as === 'pin') setPin(account.secret)
    else setPassword(account.secret)
    void submit(account.username, account.secret, as)
  }

  const subline = busy ? 'Signing in…' : mode === 'pin' ? 'Your name and the PIN from Carly.' : 'Your name and your password.'
  const recovery = mode === 'pin' ? 'Try again, or ask Carly for a new PIN.' : 'Try again.'

  return (
    <main className="mx-auto flex min-h-svh max-w-[480px] flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <header className="flex h-12 items-center px-1">
        <p className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold tracking-[0.08em] uppercase">World Gym</span>
          <span className="text-[15px] text-muted-foreground">{site}</span>
        </p>
      </header>

      <h1 className="mt-7 px-1 text-[28px] leading-tight font-semibold tracking-[-0.01em]">Sign in</h1>
      <p className="mt-1 px-1 text-[15px] text-muted-foreground" aria-live="polite">
        {subline}
      </p>

      <form
        className="mt-5 flex flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault()
          if (mode === 'password') void submit(name, password, 'password')
          else nameRef.current?.blur()
        }}
      >
        <label className="block">
          <span className="px-1 text-[13px] font-medium text-muted-foreground">Your name</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint={mode === 'pin' ? 'next' : 'go'}
            disabled={busy}
            className={cn(field, 'mt-1.5')}
          />
        </label>

        {mode === 'pin' ? (
          <>
            <div className="mt-4">
              <span id="pin-label" className="px-1 text-[13px] font-medium text-muted-foreground">
                PIN
              </span>
              <div
                key={shake}
                role="group"
                aria-labelledby="pin-label"
                aria-describedby="pin-count"
                className={cn('mt-1.5 grid grid-cols-6 gap-2', shake > 0 && 'pin-shake')}
              >
                {Array.from({ length: PIN_LENGTH }, (_, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className={cn(
                      'flex h-[52px] items-center justify-center rounded-[14px] border transition-colors duration-150',
                      i < pin.length ? 'border-foreground' : i === pin.length && !busy ? 'border-2 border-foreground' : 'border-border',
                    )}
                  >
                    {i < pin.length && <span className="size-3 rounded-full bg-foreground" />}
                  </span>
                ))}
              </div>
              <span id="pin-count" className="sr-only" aria-live="polite">
                {pin.length} of {PIN_LENGTH} digits
              </span>
            </div>

            {error && (
              <p role="alert" className="mt-3 px-1 text-[15px] leading-snug text-warn">
                <span className="font-medium">{error}</span> {error === SIGN_IN_MISMATCH && recovery}
              </p>
            )}

            <div className="mt-auto pt-6">
            <div className="grid grid-cols-3 border-t border-border">
              {KEYS.map((key, i) =>
                key === '' ? (
                  <span key="blank" className="border-b border-border border-r" aria-hidden />
                ) : (
                  <button
                    key={key}
                    type="button"
                    onClick={() => press(key)}
                    disabled={busy || (key === 'delete' && pin.length === 0)}
                    aria-label={key === 'delete' ? 'Delete last digit' : key}
                    className={cn(
                      'flex h-[clamp(56px,8.5svh,72px)] items-center justify-center border-b border-border text-[28px] font-medium transition-colors hover:bg-muted/60 active:bg-muted disabled:text-muted-foreground disabled:hover:bg-transparent',
                      i % 3 !== 2 && 'border-r',
                    )}
                  >
                    {key === 'delete' ? <Delete aria-hidden className="size-[26px]" strokeWidth={1.8} /> : key}
                  </button>
                ),
              )}
            </div>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <button type="button" onClick={() => switchMode('password')} className={textButton}>
                Use a password instead
              </button>
              <span className="text-sm text-muted-foreground">Forgot it? Ask Carly.</span>
            </div>
          </>
        ) : (
          <>
            <label className="mt-4 block">
              <span className="px-1 text-[13px] font-medium text-muted-foreground">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                enterKeyHint="go"
                disabled={busy}
                className={cn(field, 'mt-1.5 font-normal')}
              />
            </label>
            {error && (
              <p role="alert" className="mt-3 px-1 text-[15px] leading-snug text-warn">
                <span className="font-medium">{error}</span> {error.endsWith("don't match.") && recovery}
              </p>
            )}
            <div className="mt-auto pt-6">
              <button
                type="submit"
                disabled={busy || !password}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-brand text-lg font-semibold text-brand-foreground transition-[background-color,transform] duration-150 active:scale-[0.99] active:bg-brand-press disabled:bg-muted disabled:text-muted-foreground"
              >
                {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <div className="pt-2 text-center">
                <button type="button" onClick={() => switchMode('pin')} className={textButton}>
                  Use a PIN instead
                </button>
              </div>
            </div>
          </>
        )}
      </form>

      {demo.length > 0 && (
        <section aria-label="Demo accounts" className="mt-4 border-t border-border pt-3">
          <p className="px-1 text-[13px] font-medium text-muted-foreground">Demo accounts. Tap one to sign in.</p>
          <div className="mt-2 flex gap-2">
            {demo.map((a) => (
              <button
                key={a.username}
                type="button"
                onClick={() => signInAs(a)}
                disabled={busy}
                className="h-11 flex-1 rounded-[14px] border border-border bg-background text-[15px] font-semibold transition-colors hover:bg-muted active:bg-muted"
              >
                {shortName(a.full_name)}
              </button>
            ))}
          </div>
          {dataMode === 'trial' && (
            <div className="mt-2 text-center">
              <p className="text-sm text-muted-foreground">Trial: everything is saved on this phone only.</p>
              <button
                type="button"
                onClick={() => (confirmReset ? void resetTrialData() : setConfirmReset(true))}
                className="mt-1 h-11 rounded-[14px] px-4 text-base font-medium text-muted-foreground active:bg-muted"
              >
                {confirmReset ? 'Tap again to clear this phone' : 'Start again with demo data'}
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
