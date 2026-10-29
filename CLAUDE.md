# GymShift

Mobile-first roster and attendance web app for the World Gym Macquarie Park cleaning team. It replaces WhatsApp clock photos as the record of hours used for pay. **[docs/PRD.md](docs/PRD.md) is the source of truth** for features, roles and business rules. Read it before building any feature.

## Stack
- Vite + React + TypeScript, Tailwind CSS v4, shadcn/ui (radix, Nova preset), linted with oxlint
- Backend (planned, not wired in yet): Supabase (Postgres, auth, row-level security, storage). The app runs on mock data for now.
- Hosting: Cloudflare Pages (static SPA)

## Commands
- `npm run dev`: dev server
- `npm run build`: typecheck (`tsc -b`) and production build
- `npm run lint`: oxlint
- `npx shadcn@latest add <component>`: add a UI component

## Structure
- `src/types/`: one file per future DB table. Field names are snake_case and must match the Postgres columns exactly.
- `src/data/`: **the only data-access layer.** Async functions; reads return copies. `store.ts` is the in-memory "DB" plus the mock server clock, and is internal to `src/data`.
- `src/mocks/`: seed data for one fortnight (26 Oct – 8 Nov 2026, mock "now" = 28 Oct 7:40 pm). Imported **only** by `src/data`.
- `src/lib/rules.ts`: pure business rules (off-site check, over-length check, extension cap, durations). No data access.
- `src/components/ui/`: shadcn-generated. Add components via the CLI and don't hand-edit them. This folder is excluded from lint.
- `@/` aliases `src/`.

## Project rules (non-negotiable)

1. **All data access goes through `src/data` (`import … from '@/data'`).** Components, hooks and pages never import from `@/mocks`, the store or a Supabase client. When Supabase arrives, only `src/data` changes.
2. **Never overwrite or delete records.**
   - `clock_events` is append-only.
   - Attendance time changes are new `corrections` rows: who, when, old value, new value, and a required reason. The effective time is the latest correction.
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
5. **Server time is authoritative.** Never send or trust the phone's clock. In mocks use `serverNow()`; in Supabase use the DB's `now()`. Location is captured only at the moment of clocking in or out, never continuously.
6. **Permissions follow the PRD role table.**
   - Manager (Carly): everything.
   - Team lead (Gladys): rosters and approves swaps for all cleaners, on Carly's behalf. Records (photos, notes, hours) for their own group only.
   - Cleaner: own records only.
   - Only the manager approves extensions, corrects attendance, resolves flags and exports hours.
   - The checks in `src/data` mirror the planned RLS policies. UI checks are a convenience only.
7. **Business rule numbers come from `SiteSettings`** (`getSettings()`): radius, the 15/30-min flag windows, 180/210-min shift lengths, the 30-min extension request, 10 photos, 6-month retention, and the fortnight anchor date (`roster_anchor_date`). Never hardcode them.
8. **Types mirror the schema.** Change a `src/types` file together with its table, mock and data functions. Use the `Timestamp` / `DateString` / `TimeString` aliases. Timezone is `Australia/Sydney`.
9. **Mobile-first.** Every staff action takes three taps or fewer on a phone. Test at phone width.
10. **Build UI only when asked.** Screens so far: demo login, cleaner home, manager dashboard, roster (`src/pages/RosterPage.tsx`, for Carly and Gladys).

## Notes
- `no_show` and `missing_clock_out` flags depend on elapsed time and will come from a scheduled job (Supabase cron). They are seeded in mocks but not generated yet.
- Staff (from the client): Carly (manager), Gladys (team lead, also works shifts), cleaners Josh, Kyle, Gino and Angel. Josh, Kyle and Gino are in Gladys's group; Angel reports to Carly.
- Placeholders still to confirm (PRD open questions): gym coordinates and radius (`src/mocks/settings.ts`), trial start date.
