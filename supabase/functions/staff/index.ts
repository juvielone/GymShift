// Staff sign-ins (PRD F1): the only code that sets someone else's login. Called from the Staff screen
// (createUser, resetPin and username changes in src/data/live.ts).
//
// It holds the service-role key, which Supabase gives every Edge Function as a secret and which never goes in
// the app. Before touching a login it asks the database, AS THE CALLER, whether that's allowed (check_staff,
// check_pin_reset in migrations/…13_staff.sql: manager only, same checks as src/data/users.ts), so the rules
// live in one place. The one rule kept here is the PIN's: a PIN never goes to the database tables.
//
// Actions (POST JSON):
//   { action: 'create', full_name, username, role, team_lead_id, phone, pin? } → { user, pin }
//   { action: 'reset_pin', user_id, pin? } → { pin }
//   { action: 'rename', user_id, full_name, username, role, team_lead_id, phone } → { user }
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const LOGIN_DOMAIN = 'staff.gymshift.invalid'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** A refusal written for Carly's screen (status 400), or a fault (500) with a general message. */
class Refused extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

// ---- PIN: keep in step with pinProblem() / makePin() in src/data/users.ts ----

function pinProblem(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return 'A PIN is 6 digits'
  const d = Array.from(pin, Number)
  if (d.every((x) => x === d[0])) return "Pick a PIN that isn't one digit repeated"
  const run = (step: number) => d.every((x, i) => i === 0 || x - d[i - 1] === step)
  if (run(1) || run(-1)) return "Pick a PIN that isn't a straight run like 123456"
  return null
}

function makePin(): string {
  for (;;) {
    const pin = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b % 10).join('')
    if (pinProblem(pin) === null) return pin
  }
}

/** Carly's PIN if she typed one (checked), else a new one. */
function choosePin(typed: unknown): string {
  const pin = typeof typed === 'string' ? typed.trim() : ''
  if (!pin) return makePin()
  const problem = pinProblem(pin)
  if (problem) throw new Refused(problem)
  return pin
}

// ---- Calls ----

const loginEmail = (username: string) => `${username.trim().toLowerCase()}@${LOGIN_DOMAIN}`

/** A database function, run as the caller. Its own messages (P0001, 42501) are written for the screen. */
async function asCaller<T>(caller: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await caller.rpc(fn, args)
  if (error) {
    if (error.code === 'P0001' || (error.code === '42501' && !error.message.startsWith('permission denied'))) throw new Refused(error.message)
    if (error.code === '42501' || error.code === 'PGRST301' || error.code === 'PGRST303') throw new Refused('Sign in again, then try once more.', 401)
    console.error(`[staff] ${fn} failed`, error)
    throw new Refused('Not saved yet. Try again.', 500)
  }
  return data as T
}

function details(body: Record<string, unknown>, userId: string | null) {
  return {
    p_user_id: userId,
    p_full_name: body.full_name ?? null,
    p_username: body.username ?? null,
    p_role: body.role ?? null,
    p_team_lead_id: body.team_lead_id ?? null,
    p_phone: body.phone ?? null,
  }
}

async function create(caller: SupabaseClient, admin: SupabaseClient, body: Record<string, unknown>) {
  await asCaller(caller, 'check_staff', details(body, null))
  const pin = choosePin(body.pin)
  const { data, error } = await admin.auth.admin.createUser({ email: loginEmail(String(body.username)), password: pin, email_confirm: true })
  if (error || !data.user) {
    console.error('[staff] createUser failed', error)
    // A login with no staff row, left by an earlier failure: the username can't be used until it's cleared.
    if (error?.code === 'email_exists') throw new Refused('That username has an unfinished sign-in. Try another username.')
    throw new Refused('Not saved yet. Try again.', 500)
  }
  try {
    const user = await asCaller(caller, 'add_staff', details(body, data.user.id))
    return { user, pin }
  } catch (e) {
    // The login has no staff row and no records yet, so taking it back leaves nothing behind.
    const { error: undo } = await admin.auth.admin.deleteUser(data.user.id)
    if (undo) console.error('[staff] could not remove the unfinished login', data.user.id, undo)
    throw e
  }
}

async function resetPin(caller: SupabaseClient, admin: SupabaseClient, body: Record<string, unknown>) {
  const userId = String(body.user_id ?? '')
  await asCaller(caller, 'check_pin_reset', { p_user_id: userId })
  const pin = choosePin(body.pin)
  const { error } = await admin.auth.admin.updateUserById(userId, { password: pin })
  if (error) {
    console.error('[staff] PIN reset failed', error)
    throw new Refused('Not saved yet. Try again.', 500)
  }
  return { pin }
}

/** A new username: rename the login first, then the staff row (which checks the login matches). */
async function rename(caller: SupabaseClient, admin: SupabaseClient, body: Record<string, unknown>) {
  const userId = String(body.user_id ?? '')
  await asCaller(caller, 'check_staff', details(body, userId))
  const before = await admin.auth.admin.getUserById(userId)
  if (before.error || !before.data.user) throw new Refused('That person is no longer there')
  const oldEmail = before.data.user.email
  const { error } = await admin.auth.admin.updateUserById(userId, { email: loginEmail(String(body.username)), email_confirm: true })
  if (error) {
    console.error('[staff] login rename failed', error)
    throw new Refused(error.code === 'email_exists' ? 'That username has an unfinished sign-in. Try another username.' : 'Not saved yet. Try again.', error.code === 'email_exists' ? 400 : 500)
  }
  try {
    return { user: await asCaller(caller, 'update_staff', details(body, userId)) }
  } catch (e) {
    // Put the login back, so they still sign in with the username on record.
    await admin.auth.admin.updateUserById(userId, { email: oldEmail, email_confirm: true })
    throw e
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
  if (req.method !== 'POST') return reply({ error: 'Not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) return reply({ error: 'The staff function is missing its Supabase settings.' }, 500)

  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return reply({ error: 'Sign in again, then try once more.' }, 401)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  // The caller's own session: what the database checks against (the token is verified there).
  const caller = createClient(url, anonKey, { ...options, global: { headers: { Authorization: authorization } } })
  const admin = createClient(url, serviceKey, options)

  try {
    const body = (await req.json()) as Record<string, unknown>
    if (body.action === 'create') return reply(await create(caller, admin, body))
    if (body.action === 'reset_pin') return reply(await resetPin(caller, admin, body))
    if (body.action === 'rename') return reply(await rename(caller, admin, body))
    return reply({ error: 'Unknown action' }, 400)
  } catch (e) {
    if (e instanceof Refused) return reply({ error: e.message }, e.status)
    console.error('[staff] unexpected error', e)
    return reply({ error: 'Not saved yet. Try again.' }, 500)
  }
})
