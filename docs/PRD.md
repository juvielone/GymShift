# PRD — Cleaning Team Roster & Attendance App

Oct 27, 2026 · @Juvielone

## Overview

A mobile-first web app that replaces WhatsApp messages and clock photos with one record of rosters, hours and cleaning evidence for the World Gym Macquarie Park cleaning team. It is built as a free portfolio trial, with a paid arrangement discussed if the team keeps using it after the trial.

### Problem

- **Rosters are unclear.** Carly and Gladys both roster staff, shifts change often with availability, and swaps, covers, no-shows and last-minute changes cause confusion.
- **Hours are recorded informally.** Staff photograph the gym time clock at start and finish and send it over WhatsApp. Pay is calculated from those photos.
- **Extensions are unclear.** Shifts may run to 3.5 hours only with Carly's approval, but approval is verbal and inconsistent.
- **Evidence is scattered.** Up to 10 work photos per shift are sent through WhatsApp, which makes them hard to find later.

### Goals

1. Fortnightly pay can be calculated from app records alone, without clock photos.
2. Every shift has one clear owner, and swaps and covers are approved and visible.
3. Off-site clock-ins, missing clock-outs and unapproved extensions are flagged for Carly automatically.
4. Work photos and shift notes are kept in one place for 6 months.

### Success measures (end of trial)

- One full fortnightly pay cycle calculated from app data with no disputes.
- WhatsApp is no longer used for clock photos or work photos.
- Carly and Gladys use the app to publish and change the roster.

## Users and roles

There are three roles, about 7 users in total (Carly, Gladys and roughly 5 cleaners).

| Permission | Manager (Carly) | Team lead (Gladys) | Cleaner |
| --- | --- | --- | --- |
| View own shifts and hours | Yes | Yes | Yes |
| Clock in/out, upload photos, add shift notes | Yes | Yes | Yes |
| Set availability, request swaps and extensions | Yes | Yes | Yes |
| Create and publish roster | All staff | All staff (on Carly's behalf) | No |
| Approve swaps and covers | All staff | All staff (on Carly's behalf) | No |
| Approve extensions | Yes | No | No |
| Review flags and correct attendance times | Yes | No | No |
| View all photos, notes and hours | Yes | Own group | Own only |
| Leave notes for a shift | All staff | Own group | No |
| Export fortnightly hours | Yes | No | No |
| Manage users and site settings | Yes | No | No |

## Features in scope (v1)

Nine features, ordered by build priority. Each acceptance criterion is a test the feature must pass before the trial.

### F1. Accounts and login

*As a staff member, I want to log in on my phone so that I only see my own shifts and records.*

- Carly creates accounts and assigns a role. There is no public sign-up.
- Staff sign in with their username (first name, e.g. `josh`) and a 6-digit PIN, then stay signed in on the phone. Signing in happens about once per phone. *(Decided 1 Nov 2026: email links are unreliable on the free email tier, and nobody needs an inbox to get in.)*
- **Adding a person** *(decided 2 Nov 2026)*: full name, username, role or group, an optional mobile number, and a PIN.
  - Full name, so two people with the same first name can be told apart (a surname initial is enough). The username starts as the first name (`josh`), then first name and surname initial (`joshl`) if that's taken. Carly can change it. A deactivated person keeps their username.
  - Carly types the PIN or keeps the one the app makes. Easy PINs (one digit repeated, or a straight run like 123456) are refused. The PIN is shown once, to pass on in person or by message.
  - The mobile number is contact information only. It is never used to sign in or verified, and only Carly and the person can see it.
- Carly can reset anyone's PIN from their staff sheet, again typing one or keeping the app's; that is also how a forgotten PIN is fixed. Nobody, Carly included, can look a PIN up later.
- People are never deleted. Someone who leaves is deactivated: they can't sign in, they leave the roster pickers, and their hours and records stay. Someone who comes back is reactivated and given a new PIN.
- Names show as first names. When two active people share a first name, both show with their surname initial ("Josh L." and "Josh M."). Exports use full names.
- Carly signs in with her username and a longer password instead of a PIN, because her account can correct hours and export pay.
- The sign-in page asks for a typed username and never lists staff names, because its link will be shared.
- Role permissions are enforced in the database (row-level security), not only in the UI.

### F2. Fortnightly roster

*As Carly or Gladys, I want to build and publish a fortnight's roster so that everyone knows who is on.*

- A shift has a date, type (morning or night), start and end time, and an assigned cleaner.
- Shifts default to 3 hours. Morning starts around 7:00 am and night around 7:00 pm, both editable.
- A roster is drafted, then published. Staff only see published shifts.
- Changing a published shift records who changed it, when, and the old value.
- Staff see their upcoming shifts on the home screen.

### F3. Availability, swaps and covers

*As a cleaner, I want to request a swap or cover so that changes are approved and recorded, not lost in chat.*

- Cleaners can mark dates they are unavailable for the next fortnight ("Days I can't work": a Mon–Sun grid, from tomorrow on, with an optional note). The roster shows it to Carly and Gladys as a warning; it never blocks.
- **Can't make a shift?** The person on it picks a free colleague, or "Anyone who's free", with an optional reason (Sick, Family, Other). It is one-way: to trade, the other person asks back. *(Decided 3 Nov 2026.)*
- **The colleague says yes first.** A named colleague sees "Josh asked you" with Not me / I'll take it; an open shift shows to everyone free with I'll take it. Nothing reaches Carly or Gladys until someone has said yes (except an open shift, which they can give to someone directly).
- Carly or Gladys then approves or declines; on approval the shift moves to the new person and the change is logged. **Nobody decides a request they are part of:** if Gladys asked, or is the one taking the shift, Carly decides.
- The person who asked can **withdraw** it while it is waiting. A request is decided once (approved, declined or withdrawn) and stays on record.
- Nothing is handed over once the shift has started: it stays with whoever is on it, and the usual no-show rules apply.
- Cleaners never cancel a shift. If nobody can take it, Carly or Gladys gives it to someone or cancels it (F2).
- Both cleaners and the approver can see the request and where it is up to ("Asked Gladys · waiting for an answer", "Gladys said yes · waiting for approval").

### F4. Clock in and clock out with location

*As a cleaner, I want to clock in and out in one tap so that my hours are recorded without sending photos.*

- Clocking in links to the cleaner's shift for that day, if one exists.
- Unscheduled clock-ins are allowed but flagged.
- The server records the time (the phone's clock is never trusted), plus latitude, longitude, GPS accuracy, and distance from the gym.
- If location is denied or times out, the clock-in still saves and is flagged as having no location.
- Location is captured only at the moment of clocking in or out, never continuously.

### F5. Extension requests

*As a cleaner, I want to request an extension so that extra time is approved before I work it.*

- A cleaner can request up to 30 extra minutes on an active shift, with a reason.
- Carly approves or declines. The cleaner sees the result in the app.
- A shift longer than 3 hours without an approved extension is flagged.
- No shift can be approved beyond 3.5 hours.

### F6. Flags and attendance corrections

*As Carly, I want unusual entries flagged so that I can follow up and fix the recorded time.*

- Automatic flags:
  - clock-in or clock-out outside the gym radius
  - no location
  - unscheduled shift
  - no clock-in 15 minutes after the shift starts (possible no-show)
  - no clock-out 30 minutes after the shift ends
  - shift over 3 hours without an approved extension
  - clock-out within 2 minutes of clocking in (a very short session)
  - clock-in more than 30 minutes before or after the rostered start
- Carly can adjust a clock-in or clock-out time, and must enter a reason.
- The original record is never overwritten. Every correction stores who changed it, when, the old and new value, and the reason.
- Carly can mark a flag as resolved.
- **Accidental clock-ins** *(decided 2 Nov 2026)*:
  - Clock in asks once ("Clock in now?") when there's no shift today or it's more than 30 minutes from the rostered start. An on-time clock-in stays one tap.
  - Clocking in while already clocked in saves nothing and shows "You're already clocked in since 6:02 pm" with Clock out or Cancel.
  - A cleaner can tap "This was a mistake" on a clock-in and pick a reason. A clock-in still open is clocked out at the same time, so they can clock in properly. Carly approves (the clock-in is voided) or keeps it. Carly can also void a clock-in directly, with a reason.
  - A voided clock-in, and its clock-out, stay on record (who voided it, when, why) but count nowhere: not in hours, Today, the export or the home screen. Shift records show them only with "Show voided".
- **Late clock-out** (clocked out after the approved finish): the cleaner is asked what happened. "I stayed to finish" asks for the extra time as an extension (same limits). "I forgot to clock out" sends the time they left, which becomes a correction once Carly approves. Carly sees where the phone was at the clock-out.
- **Forgotten clock-out**: a session still open 2 hours after its approved end is closed automatically at that end (the rostered end plus approved extra time; unscheduled, clock-in plus 3 hours). This doesn't cut hours: no end time was measured, so the rostered end stands in, labelled "Closed automatically". The cleaner is asked "Is that right?" next time they open the app ("That's right", or the time they finished), and their photo window opens from then. Carly approves, and the missing clock-out flag is resolved.
- Location is still captured only when someone clocks in or out; nothing checks it at the end of a shift.

### F7. Work photos

*As a cleaner, I want to upload my work photos against my shift so that Carly can check them without WhatsApp.*

- Up to 10 photos per shift, uploaded from clock-in until 3 hours after clock-out.
- Photos are compressed on the phone to about 150 KB before upload.
- Each photo stores the shift, the cleaner and the upload time.
- Clocking out with no photos asks "Add your photos first?" once. The cleaner can still clock out without them; it never blocks. *(Decided 30 Oct 2026.)*
- A cleaner can remove a photo they added by mistake within 10 minutes of adding it. After that only Carly can remove it. A removed photo keeps its record (who removed it, when); only the image is deleted.
- Photos are deleted automatically after 6 months.

### F8. Shift notes and supply alerts

*As a cleaner, I want to leave a note on my shift so that I can flag low supplies or issues.*

- A note can be added to the cleaner's own shift, with an optional tag: Supplies low, Issue, General, or Running late.
- Notes tagged Supplies low or Issue appear on Carly's dashboard until she marks them done.
- **Notes for the shift** *(asked for by Carly, decided 5 Nov 2026)*: Carly can leave a note on any shift, and a team lead on their own group's shifts ("Thursday night, please do the dusting"), from the roster's shift sheet. It is for one specific shift, so Carly can tell the person ahead of time.
  - The person on the shift sees a new note on their home under the shift card and taps "Got it". After that, a note on today's shift stays there until they clock out, and one on a later shift sits on that shift's card in Next shifts. The writer sees "Seen" with the time, or "Not seen yet", and the note box is the first thing in the roster's shift sheet.
  - The note belongs to the shift: if the shift is swapped, the new person sees it. A note on a draft is seen once the fortnight is published. No new notes on a cancelled or finished shift.
  - Carly can also write one from her dashboard: tapping a row on the Today pass opens the shift with the note box on top, before or during the shift. The row shows "Note seen" or "Note not seen yet" until the shift is done. After the shift, notes show in the shift record as facts and no new ones can be added. *(Decided 6 Nov 2026.)*
  - Notes are never edited or deleted. Whoever wrote one, or Carly, can take it back; it stays on record. There are no phone notifications (push is out of scope): staff see notes when they open the app.
- **Running late** is sent before clock-in, with about how late ("about 15 min"). It is information, not a task: it does not go into Carly's list. Her Today card shows "Running late · about 7:15 pm" instead of "Not in yet". The no-show check waits until that time plus the no-show window before flagging. Pay is unaffected, because paid time starts at clock-in. *(Decided 30 Oct 2026.)*

### F9. Manager dashboard and hours export

*As Carly, I want one screen showing today and anything that needs attention so that I don't have to chase people.*

- The dashboard shows today's shifts with clock-in status, open flags, pending requests, and open supply notes.
- Carly can view photos and notes grouped by shift: tapping a shift on her Today card, or in Shift records, opens its record (clock times with location and corrections, worked time, photos, notes, flags).
- **Shift records** list past shifts one fortnight at a time (the roster and pay period), with a person picker and ‹ › arrows back to the 6-month retention limit, plus a summary line (shifts, hours, shifts with no photos) that matches the hours export for that fortnight. Carly sees everyone, Gladys her own group. *(Decided 31 Oct 2026.)*
- Cleaners see their own past shifts the same way ("My past shifts"), with their hours for the chosen fortnight, so they can check their pay period. *(Decided 31 Oct 2026.)*
- Carly can export a fortnight's hours per cleaner as a CSV file, using corrected times.
- Exported hours match the sum of the shift durations shown in the app.

## Business rules

Rules marked *confirmed* come from Carly. The rest are defaults to check during the trial.

| Rule | Value | Status |
| --- | --- | --- |
| Standard shift length | 3 hours | Confirmed |
| Maximum shift with approved extension | 3.5 hours | Confirmed |
| Who approves extensions | Carly only | Confirmed |
| Who approves swaps and covers | Carly or Gladys | Confirmed |
| Roster and pay period | Fortnightly | Confirmed |
| Off-site clock-in/out | Allowed, flagged for review | Confirmed |
| Photo and report retention | 6 months, then auto-delete | Confirmed |
| Shifts per day | 2 (morning \~7:00 am, night \~7:00 pm) | From staff experience |
| Breaks | None tracked | From staff experience |
| Gym geofence radius | 150 m, adjusted for GPS accuracy | Default |
| No-show flag | No clock-in 15 min after shift start | Default |
| Missing clock-out flag | No clock-out 30 min after shift end | Default |
| Forgotten clock-out closed automatically | 2 hours after the approved end, at that end | Default (decided 2 Nov 2026) |
| Clock-in far from the start (ask first, flag) | More than 30 min before or after | Default (decided 2 Nov 2026) |
| Very short session flag | Clock-out within 2 min of clock-in | Default (decided 2 Nov 2026) |
| Max photos per shift | 10 | From current WhatsApp practice |
| Photo upload window | Until 3 hours after clock-out | Default (decided 30 Oct 2026) |
| Remove own photo | Within 10 min of adding it | Default (decided 30 Oct 2026) |

**Off-site rule:** an event is flagged when its distance from the gym, minus the GPS accuracy, is greater than the radius. Poor accuracy alone never blocks anyone.

**Hours for pay:** paid hours are clock-out minus clock-in, using corrected times where Carly has made a correction. The app never cuts hours automatically: time over 3 hours without an approved extension is flagged for Carly to review, because hours actually worked generally have to be paid.

## Out of scope for v1

These are deferred until after the trial, and added only if the trial shows a real need.

- Push notifications and reminders (e.g. a missed clock-out reminder). The dashboard flags cover this for now.
- Cleaning checklists and structured shift reports.
- Payroll calculation, pay rates or integration with payroll software. The app exports hours only.
- Multiple sites or gyms. A follow-up after the MVP; see Multiple sites below.
- Stronger sign-in (see Later: stronger sign-in below).
- Native iOS or Android apps. v1 is a mobile web app.
- Offline clock-in.
- Continuous or live location tracking.

### Later: stronger sign-in (parked 1 Nov 2026)

A username and PIN suit the trial. If the team moves to a paid arrangement, these are proposed as an extra layer:

- **Own email sign-in** for each person (magic link or password), with a proper email service.
- **Authenticator app for Carly** (a 6-digit code from an app such as Google Authenticator at sign-in). Free in Supabase; parked 2 Nov 2026 to keep the trial simple.
- **One phone per person.** Each sign-in records the phone; signing in on a new phone flags it for Carly and signs the old one out. A clock-in from a phone last used by someone else is flagged ("Josh clocked in from Gladys's phone"). This makes one coworker clocking in for another visible to Carly. It never blocks.
- ~~**Early clock-in flag.**~~ Done in F6 (2 Nov 2026): a clock-in more than 30 minutes from the rostered start asks first and is flagged.
- **Clock-out reminder.** A notification at the shift's end ("Still at work? Tap to clock out") would stop most forgotten clock-outs. A web app can only send one when it's added to the home screen. Out of scope for v1 (no push).

### Multiple sites (raised by Carly, 30 Oct 2026; follow-up after the MVP)

Carly asked whether the app could cover more locations if the team works across more than one. Carly's intention is to bring cleaners, starting with Juvie, to other sites as well *(clarified 1 Nov 2026)*, so the main case is one person working at several sites. v1 stays at one site for the trial; this is followed up with Carly once the MVP is done.

How it would work:

- **Sites.** Each site has its own name, gym location, radius and timezone. Carly adds a site from her dashboard the same way she sets the gym location today. The other business rules (shift lengths, flag windows, photo limits, retention) stay shared across sites unless one needs its own.
- **Roster.** Every shift belongs to a site. Rosters are built per site on the same fortnightly cycle, with a site switcher on the roster screen. Two shifts a day becomes two shifts a day per site.
- **Staff.** People aren't tied to one site. Anyone can be rostered at any site, and the roster warns if someone is booked at two sites at overlapping times or too close together to travel between them. Their home screen lists upcoming shifts with the site name, and their hours and past shifts cover every site.
- **Clock in stays one tap.** The site comes from the cleaner's shift that day, and the off-site check uses that site's location. Cleaners never pick a site. An unscheduled clock-in is matched to the nearest site and flagged as it is now.
- **Carly's dashboard.** Today's shifts, flags and notes show the site on each row, with a site filter once there is more than one. "Supplies low" says which gym.
- **Hours export.** Still one row per person, because pay is per person, totalling hours across all sites, with an optional per-site breakdown.
- **Team leads.** A group stays a group of people, so Gladys's group is the same at any site.
- **Cost.** A few sites still fit the free tiers. Photo storage grows with the number of shifts (see Free-tier limits).

## Non-functional requirements

- **Mobile-first:** every staff action takes three taps or fewer on a phone. It is tested on iOS Safari and Android Chrome.
- **HTTPS only:** browser location requires it.
- **Security:** permissions are enforced with database row-level security. Photos are in private storage and served through short-lived signed links.
- **Audit trail:** attendance events are append-only. Roster changes, approvals and corrections are logged with who, when, old value and new value.
- **Data protection:** a nightly database backup to a separate location, plus Carly's fortnightly CSV export as her own copy of hours.
- **Privacy:** location is captured only at clock-in and clock-out. Staff can see their own recorded location. A mobile number, if given, is seen only by Carly and the person. An in-app notice explains what is collected and why.
- **Workplace surveillance (NSW):** staff must receive written notice at least 14 days before location capture starts. The employer gives this notice; the app's privacy notice supports it.
- **Performance:** clock-in completes within 5 seconds on mobile data, including the location lookup.
- **Cost:** runs on free tiers during the trial.

## Constraints, trial terms and costs

The trial is free and runs on free tiers. It becomes a paid arrangement only if the team keeps relying on it after the trial.

### Stack

- **Frontend:** React (Vite + TypeScript, Tailwind CSS, shadcn/ui) as a static single-page app, mobile-first.
- **Backend:** Supabase (Postgres, auth, row-level security, file storage).
- **Hosting:** Cloudflare Pages. Its free tier allows business use; Vercel's free Hobby plan does not.

### Trial terms

- Length: 4 weeks, covering two full fortnightly pay cycles.
- Free to the team during the trial.
- Built and maintained by Juvie as a portfolio project, with fixes on a best-effort basis.
- With Carly's permission, the project can appear in Juvie's portfolio with names and locations removed.
- After the trial, there are three options: keep using it under a small monthly fee for hosting, backups and support; keep it as a portfolio piece only; or stop.

### Free-tier limits and photo storage

- Supabase Free: about 500 MB database and 1 GB file storage, with no managed backups ([pricing](https://supabase.com/pricing)).
- Photo estimate: 2 shifts × 10 photos × 182 days ≈ 3,600 photos. At 150 KB each that's about 550 MB, which fits the free tier.
- If photos grow beyond the free tier, or the team relies on the app daily after the trial, it moves to Supabase Pro at about US$25 (roughly A$40) per month, which the business pays.

Prices are approximate as of October 2026.

## Assumptions and open questions

### Assumptions

- During the trial, app records replace the clock photos as the hours used for pay. This is based on Carly saying "let's trial using the app for clocking in and out."
- There are about 5 cleaners at one site (Macquarie Park).
- Before Supabase is connected, the trial build keeps its data on the phone (browser storage) and takes the time from the web server's clock, never the phone's. Each phone has its own copy, so this is for testing only, not for pay.
- Gladys rosters and approves swaps and covers for all cleaners, acting on Carly's behalf. She still sees records (photos, notes, hours) only for her own group. *(Changed 29 Oct 2026.)*
- Every staff member uses their own smartphone with mobile data. Reception inside the gym is good.

### Open questions

- [ ] Exact headcount and names for account setup.
- [ ] Who sends staff the written location notice 14 days before the trial starts?
- [ ] Trial start date.
- [x] Exact gym coordinates: -33.78040309069026, 151.12136047301382 (confirmed 2 Nov 2026; in the demo data and local seed).
- [ ] The radius to use (default 150 m). Carly can change it in the app; the live database still needs the coordinates set once before the trial.
- [ ] Multiple sites (Carly, 30 Oct 2026; follow-up after the MVP): which other locations, and when? Would they use different shift times or rules? Would a team lead look after a site, or a group of people wherever they work?
