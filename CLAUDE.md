# GymShift

Mobile-first roster and attendance web app for the World Gym Macquarie Park cleaning team. It replaces WhatsApp clock photos as the record of hours used for pay. **[docs/PRD.md](docs/PRD.md) is the source of truth** for features, roles and business rules. Read it before building any feature.

## Stack
- Vite + React + TypeScript, Tailwind CSS v4, shadcn/ui (radix, Nova preset), linted with oxlint
- Backend (being built, not wired in yet): Supabase (Postgres, auth, row-level security, storage). Migrations in `supabase/migrations`; the app still runs on mock data.
- Hosting: Cloudflare Pages (static SPA)

## Commands
- `npm run dev`: dev server (demo mode: seeded fortnight at the mock time, resets on reload)
- `npm run dev:live`: dev server against Supabase (live mode: real sign-in, data from the database; needs `.env.local`). Writes without a database function yet say "This isn't switched on in the live app yet."
- `npm run build` then `npx vite preview`: the production build runs in **trial mode** (see `store.ts`). Force either mode with `VITE_DATA_MODE=demo|trial`.
- `npm run build`: typecheck (`tsc -b`) and production build
- `npm run lint`: oxlint
- `npm run test:db`: applies `supabase/migrations` to an in-memory Postgres (PGlite) and tests the database rules (see `supabase/README.md`)
- Local Supabase (Docker Desktop running): `npm run db:start`, then `npm run db:reset` (migrations + `supabase/seed.sql` test cases), then `npm run dev:localdb` (local publishable key from `npx supabase status` in `.env.localdb.local`). `npm run db:stop` when done.
- `npx shadcn@latest add <component>`: add a UI component

## Structure
- `src/types/`: one file per future DB table. Field names are snake_case and must match the Postgres columns exactly.
- `src/data/`: **the only data-access layer.** Async functions; reads return copies. `store.ts` is the in-memory "DB", the server clock and the mock sign-in, and is internal to `src/data`. Two modes until Supabase: **demo** (dev server: seed data, fixed mock time, reset on reload) and **trial** (production build: real time read from our web server's `Date` header, data saved on the phone in localStorage, photo images in IndexedDB via `photoFiles.ts`). Every write exported from `src/data/index.ts` is wrapped in `persisted()`; wrap any new write the same way.
- `src/mocks/`: seed data for one fortnight (26 Oct – 8 Nov 2026, mock "now" = 28 Oct 6:50 pm). Imported **only** by `src/data`.
- `src/lib/rules.ts`: pure business rules (off-site check, over-length check, extension cap, durations). No data access.
- `src/components/ui/`: shadcn-generated. Add components via the CLI and don't hand-edit them. This folder is excluded from lint.
- `@/` aliases `src/`.

## Project rules (non-negotiable)

1. **All data access goes through `src/data` (`import … from '@/data'`).** Components, hooks and pages never import from `@/mocks`, the store or a Supabase client. When Supabase arrives, only `src/data` changes.
2. **Never overwrite or delete records.**
   - `clock_events` is append-only. A forgotten session is closed by a new `out` event with `source = 'auto'` and an `assumed_time` (the approved end).
   - Attendance time changes are new `corrections` rows: who, when, old value, new value, and a required reason. The effective time is the latest correction, else `assumed_time`, else `server_time`.
   - A clock-in made by mistake is voided with an append-only `clock_voids` row (its clock-out too). Voided events count nowhere (sessions, hours, export, home) but stay on record.
   - A cleaner's "This was a mistake" / "When did you finish?" is a `correction_requests` row, decided once by the manager.
   - Edits to a published shift append to `shift_changes`.
   - A draft shift nobody has seen may be deleted. A published shift is never deleted: it is set to `cancelled` and logged. A shift someone has clocked into can't be cancelled or reassigned (its hours belong to the assignee).
   - A swap or extension request is decided once (pending → approved/declined, recording `decided_by`/`decided_at`) and is never re-decided.
   - Resolving a flag or finishing a note sets `resolved_*` / `done_*`; it never deletes anything.
3. **Never auto-cut hours.**
   - Paid time is clock-out minus clock-in, using corrected times. Nothing truncates, rounds down or caps worked minutes.
   - Time over 3h without an approved extension is *flagged* for Carly. It is never reduced.
   - An extension can't be *approved* beyond 3.5h in total. That cap applies to approvals, not to recorded time.
4. **Flag, don't block.**
   - Off-site, no-location (denied/timeout/unavailable) and unscheduled clock-ins and clock-outs always save, then raise a flag.
   - Off-site means `distance − accuracy > radius`. Poor GPS accuracy alone never flags or blocks.
5. **Server time is authoritative.** Never send or trust the phone's clock. In mocks use `serverNow()` (demo: mock time; trial: the web server's `Date` header, counted forward with `performance.now()` and re-read before every clock event); in Supabase use the DB's `now()`. Location is captured only at the moment of clocking in or out, never continuously.
6. **Permissions follow the PRD role table.**
   - Manager (Carly): everything.
   - Team lead (Gladys): rosters and approves swaps for all cleaners, on Carly's behalf. Records (photos, notes, hours) for their own group only.
   - Cleaner: own records only.
   - Only the manager approves extensions, corrects attendance, resolves flags and exports hours.
   - The checks in `src/data` mirror the planned RLS policies. UI checks are a convenience only.
7. **Business rule numbers come from `SiteSettings`** (`getSettings()`): radius, the 15/30-min flag windows, 180/210-min shift lengths, the 30-min extension request, 10 photos, 6-month retention, the fortnight anchor date (`roster_anchor_date`), the 30-min start mismatch, the 2-min short session and the 120-min automatic close. Never hardcode them.
8. **Types mirror the schema.** Change a `src/types` file together with its table, mock and data functions. Use the `Timestamp` / `DateString` / `TimeString` aliases. Timezone is `Australia/Sydney`.
9. **Mobile-first.** Every staff action takes three taps or fewer on a phone. Test at phone width.
10. **Build UI only when asked.** Screens so far: sign in (`src/pages/SignIn.tsx`: username + 6-digit PIN keypad, password for Carly, demo accounts helper while on mock data), cleaner home (with location help), manager dashboard (gym location under the avatar menu's "Manage"), staff (`src/pages/StaffPage.tsx` and `StaffSheet`, Carly only: add with full name, username, optional mobile and a PIN she types or keeps from the app, shown once; reset PIN; change role or group; deactivate, or reactivate with a new PIN; never delete), roster (`src/pages/RosterPage.tsx`, for Carly and Gladys). On the cleaner home: work photos row (`PhotosRow`, upload queue in `usePhotoUploads`, compression in `src/lib/image.ts`), "Add your photos first?" on clock-out (`PhotoPrompt`), photo view/remove (`PhotoSheet`), and "Note for Carly" (`NoteSheet`, incl. Running late before clock-in). Carly's dashboard lists Supplies low and Something wrong notes under "Notes"; running late shows only on her Today pass. Past shifts: `src/pages/RecordsPage.tsx` ("Shift records" for Carly and Gladys with a person picker, "My past shifts" for cleaners; one fortnight at a time with ‹ › arrows), and the read-only shift sheet `src/components/records/ShiftRecordSheet.tsx`, opened from the records list and from rows on Carly's Today pass. Records come from `getShiftRecord(s)` in `src/data/records.ts`, scoped by the role's `view_records_scope`.

## Notes
- `no_show` and `missing_clock_out` flags depend on elapsed time and come from a scheduled job: `private.raise_due_flags()` in `supabase/migrations/…08_due_flags.sql` (replaced in `…12_attendance_fixes.sql`), run every 5 minutes by pg_cron (live app only; seeded in mocks, not generated in demo or trial). Its no-show time mirrors `noShowDueAt()` in `src/lib/rules.ts` (a "running late" note's time plus the no-show window); keep the two in step.
- The same job then runs `private.close_forgotten_sessions()`: the automatic close mirrors `assumedEnd()` / `autoCloseDueAt()` in `src/lib/rules.ts`; keep them in step. Trial mode runs its stand-in (`src/data/dueJobs.ts`) on start and on each refresh; demo mode shows seeded cases only.
- Attendance fixes (F6): `src/data/attendanceFixes.ts` (requests, voids) mirrors `…12_attendance_fixes.sql`. Cleaner home: "Clock in now?" (`ClockInConfirm`), "You look far from the gym" before an off-site clock-in (`AwayFromGymSheet`: Check again / Clock in anyway; no location uses `LocationFailSheet`), "Already clocked in" (`AlreadyClockedInSheet`), "This was a mistake" (`MistakeSheet`), late or automatic clock-out (`FinishTimeSheet`). Carly: "Corrections" chip on the dashboard (`RequestList`), Correct / Void in the shift sheet and flag sheet (`ClockFixForm`), "Show voided" on Shift records.
- Staff accounts (F1): `src/data/users.ts` mirrors `…13_staff.sql` and the `staff` Edge Function (`supabase/functions/staff`, the only code that makes logins, sets PINs or renames logins; keep its `pinProblem()` in step with `users.ts`). A mobile number lives in `user_contacts` (Carly and the person only), never in `users`, which everyone can read. Name other people with `shortName()` from `src/lib/format.ts` ("Josh L." when two active people share a first name; `src/data` keeps its team list current via `syncTeamNames()`); `firstName()` is only for greeting the person themselves.
- Staff (from the client): Carly (manager), Gladys (team lead, also works shifts), cleaners Josh, Kyle, Gino and Angel. Josh, Kyle and Gino are in Gladys's group; Angel reports to Carly.
- Gym coordinates are confirmed (-33.78040309069026, 151.12136047301382; in `src/mocks/settings.ts` and `supabase/seed.sql`). Still to confirm (PRD open questions): the radius (Carly sets it from her dashboard via `updateSiteLocation`) and the trial start date.
- Demo mode uses the phone's real position unless the Dev panel's "Next location fix" picks a fake one ("At the gym", "Away (1 km)", denied, …); the pick survives sign-ins until the page reloads. Live mode has no Dev panel and always uses real GPS. Carly's Gym location sheet ("Use my current location", "Test my distance") always uses real GPS (`getRealLocation()`).
