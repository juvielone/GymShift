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
| `tests/db.test.mjs` | Runs every migration in an in-memory Postgres and checks the rules. `npm run test:db` |

Every write the app makes is a database function (RPC) that checks who is calling with `auth.uid()` and uses the database clock (`now()`), never the phone's. Clock in/out, the gym location, the roster, notes and flags (raised and resolved) are done; the rest (swaps, extensions, corrections, photos, staff) come next.

## Setting up the project (once)

1. Create a free project at supabase.com in the **Sydney** region.
2. **Authentication settings:** turn off "Allow new users to sign up" and turn off "Confirm email". Keep the minimum password length at 6 (a PIN is 6 digits).
3. Apply the migrations in order, either by pasting each file into the SQL Editor, or with the CLI:
   `npx supabase link --project-ref <ref>` then `npx supabase db push`.
4. Put the project URL and the **anon** key in `.env.local` (not committed). Never put the `service_role` key in the app.

## Sign-in (PRD F1)

Staff sign in with a username and a 6-digit PIN; Carly with her username and a password. Supabase signs people in by email and password, so each username maps to a hidden address, `<username>@staff.gymshift.invalid` (`.invalid` can never receive mail), and the PIN is the password. Staff never see the address.

Creating a person and resetting a PIN set someone else's password, which only the server may do. That will be a small Edge Function called from the Staff screen; until it exists, create accounts in the dashboard (Authentication → Add user, with the hidden address and the PIN) and insert their `users` row.
