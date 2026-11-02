# Supabase

The database for GymShift. The app still runs on mock data (`src/data`); these migrations are the schema it moves to.

## What's here

| File | What it does |
| --- | --- |
| `migrations/…01_schema.sql` | Tables, one per file in `src/types`, with the same column names. Roles seeded from the PRD role table. |
| `migrations/…02_guards.sql` | Record-keeping rules enforced by the database itself: append-only clock events, corrections and shift changes; flags, notes and photos set once; swaps and extensions decided once; published shifts cancelled, never deleted, every change logged. |
| `migrations/…03_rls.sql` | Row-level security. The app can only **read**, and only what the role allows (manager everyone, team lead their group, cleaner themselves). |
| `migrations/…04_clock.sql` | `clock_in` / `clock_out`: the server stamps the time, works out the distance and raises flags. |
| `migrations/…05_site_location.sql` | `update_site_location`: Carly moves the gym point and radius (manager only). |
| `migrations/…06_roster.sql` | `create_shift`, `update_shift`, `remove_shift`, `copy_fortnight`, `publish_fortnight`: building the roster (Carly and Gladys). |
| `migrations/…07_notes.sql` | `add_note`, `mark_note_done`: notes for Carly (supplies low, something wrong, running late) and her marking them done. |
| `migrations/…08_due_flags.sql` | `private.raise_due_flags()`, run every 5 minutes by pg_cron: possible no-show and missing clock-out flags. |
| `migrations/…09_resolve_flag.sql` | `resolve_flag`: Carly resolves a flag (manager only). |
| `migrations/…10_photos.sql` | The private `shift-photos` Storage bucket and its rules; `add_photo`, `remove_photo`. |
| `migrations/…11_attendance_enums.sql` | New enum values for the next file (a new enum value can't be used in the transaction that adds it). |
| `migrations/…12_attendance_fixes.sql` | PRD F6 fixes: `clock_voids` and `correction_requests` (append-only / decided once); `request_void`, `request_end_time`, `decide_correction_request`, `void_clock_in`, `correct_clock_time`, `request_extension`, `decide_extension`; `clock_in` refuses a second open clock-in and flags off-start; `clock_out` flags very short sessions; the scheduled job also closes forgotten sessions at the approved end (`private.close_forgotten_sessions()`). Voided events count nowhere. |
| `migrations/…13_staff.sql` | Staff (PRD F1): `user_contacts` (optional mobile, readable only by Carly and the person; `users.email` dropped); `update_staff`, `set_staff_active`; and `check_staff`, `check_pin_reset`, `add_staff`, which the staff Edge Function calls as Carly around its login changes. Nobody is ever deleted. |
| `migrations/…14_swap_enums.sql` | The `withdrawn` request status (its own file, like 11). |
| `migrations/…15_swaps.sql` | Swaps, covers and days off (PRD F3): `request_swap`, `answer_swap` (the colleague's yes or no), `withdraw_swap`, `decide_swap` (Carly or Gladys, never someone in the request; moves the shift and logs it), `set_days_off`. Open covers are readable by all staff. |
| `functions/staff/index.ts` | Edge Function: the only code that makes logins, sets PINs and renames logins. Holds the service-role key (a Supabase secret, never in the app); asks the database first. |
| `seed.sql` | Local test data only (`npm run db:reset`): six sign-ins with known PINs, a fortnight around today, and one case for each attendance fix. Never run it against the real project. |
| `tests/db.test.mjs` | Runs every migration in an in-memory Postgres (with small stand-ins for Supabase auth and Storage) and checks the rules. `npm run test:db` |

Every write the app makes is a database function (RPC) that checks who is calling with `auth.uid()` and uses the database clock (`now()`), never the phone's. Clock in/out, the gym location, the roster, notes, flags (raised and resolved), photos, extensions, corrections, voids, staff, swaps and days off are done; deleting photos after 6 months comes next.

## Local database (for testing)

Needs Docker Desktop running. The Supabase CLI is a dev dependency (`npx supabase …`).

1. `npm run db:start` starts Postgres, auth, Storage and the API on your machine (first run downloads the images).
2. `npm run db:reset` applies every migration, then `seed.sql`. Run it again any time for a clean database.
3. Copy the local publishable key from `npx supabase status` into `.env.localdb.local` as `VITE_SUPABASE_PUBLISHABLE_KEY=…`, then `npm run dev:localdb`.
4. Sign in with the usernames and PINs at the top of `seed.sql`. The local dashboard is at http://127.0.0.1:54323.
5. To try the Staff screen (adding people, PINs): `npx supabase functions serve staff` in another terminal. It gets the local keys by itself.
6. `npm run db:stop` when done.

## Setting up the project (once)

1. Create a free project at supabase.com in the **Sydney** region.
2. **Authentication settings:** turn off "Allow new users to sign up" and turn off "Confirm email". Keep the minimum password length at 6 (a PIN is 6 digits).
3. Apply the migrations in order, either by pasting each file into the SQL Editor, or with the CLI:
   `npx supabase link --project-ref <ref>` then `npx supabase db push`.
4. Put the project URL and the **anon** key in `.env.local` (not committed). Never put the `service_role` key in the app.
5. Deploy the staff function: `npx supabase functions deploy staff`. Supabase gives it the project URL and keys itself; nothing to paste.
6. Make Carly's account once, by hand: Authentication → Add user with `carly@staff.gymshift.invalid`, her password and "Auto confirm", then insert her `users` row (role `manager`). Everyone else is added by Carly from the Staff screen.

## Sign-in (PRD F1)

Staff sign in with a username and a 6-digit PIN; Carly with her username and a password. Supabase signs people in by email and password, so each username maps to a hidden address, `<username>@staff.gymshift.invalid` (`.invalid` can never receive mail), and the PIN is the password. Staff never see the address.

Creating a person, resetting a PIN and changing a username change someone else's login, which only the server may do: the `staff` Edge Function does it. It runs `check_staff` / `check_pin_reset` as the caller first (manager only), then changes the login with the service-role key, then saves the staff row with `add_staff` / `update_staff`, which only accept a login that matches the username. If that last step fails, the login change is undone. Carly types the PIN or keeps the one the app makes; easy PINs (111111, 123456) are refused. A PIN never goes into our tables.

An optional mobile number is kept in `user_contacts`, readable only by Carly and the person. It is contact information: never used to sign in and never verified (so no SMS costs).
