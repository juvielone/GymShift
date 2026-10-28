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
| Export fortnightly hours | Yes | No | No |
| Manage users and site settings | Yes | No | No |

## Features in scope (v1)

Nine features, ordered by build priority. Each acceptance criterion is a test the feature must pass before the trial.

### F1. Accounts and login

*As a staff member, I want to log in on my phone so that I only see my own shifts and records.*

- Carly creates accounts and assigns a role. There is no public sign-up.
- Login works by email magic link or password and stays signed in on the phone.
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

- Cleaners can mark dates they are unavailable for the next fortnight.
- A cleaner can request a swap with a named colleague, or release a shift for cover.
- Carly or Gladys approves or declines. On approval, the shift's assigned cleaner updates.
- Both cleaners and the approver can see the request and its outcome.

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
- Carly can adjust a clock-in or clock-out time, and must enter a reason.
- The original record is never overwritten. Every correction stores who changed it, when, the old and new value, and the reason.
- Carly can mark a flag as resolved.

### F7. Work photos

*As a cleaner, I want to upload my work photos against my shift so that Carly can check them without WhatsApp.*

- Up to 10 photos per shift, uploaded during or after the shift.
- Photos are compressed on the phone to about 150 KB before upload.
- Each photo stores the shift, the cleaner and the upload time.
- Photos are deleted automatically after 6 months.

### F8. Shift notes and supply alerts

*As a cleaner, I want to leave a note on my shift so that I can flag low supplies or issues.*

- A note can be added to any shift, with an optional tag: Supplies low, Issue, or General.
- Notes tagged Supplies low appear on Carly's dashboard until she marks them done.

### F9. Manager dashboard and hours export

*As Carly, I want one screen showing today and anything that needs attention so that I don't have to chase people.*

- The dashboard shows today's shifts with clock-in status, open flags, pending requests, and open supply notes.
- Carly can view photos and notes grouped by shift.
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
| Max photos per shift | 10 | From current WhatsApp practice |

**Off-site rule:** an event is flagged when its distance from the gym, minus the GPS accuracy, is greater than the radius. Poor accuracy alone never blocks anyone.

**Hours for pay:** paid hours are clock-out minus clock-in, using corrected times where Carly has made a correction. The app never cuts hours automatically: time over 3 hours without an approved extension is flagged for Carly to review, because hours actually worked generally have to be paid.

## Out of scope for v1

These are deferred until after the trial, and added only if the trial shows a real need.

- Push notifications and reminders (e.g. a missed clock-out reminder). The dashboard flags cover this for now.
- Cleaning checklists and structured shift reports.
- Payroll calculation, pay rates or integration with payroll software. The app exports hours only.
- Multiple sites or gyms.
- Native iOS or Android apps. v1 is a mobile web app.
- Offline clock-in.
- Continuous or live location tracking.

## Non-functional requirements

- **Mobile-first:** every staff action takes three taps or fewer on a phone. It is tested on iOS Safari and Android Chrome.
- **HTTPS only:** browser location requires it.
- **Security:** permissions are enforced with database row-level security. Photos are in private storage and served through short-lived signed links.
- **Audit trail:** attendance events are append-only. Roster changes, approvals and corrections are logged with who, when, old value and new value.
- **Data protection:** a nightly database backup to a separate location, plus Carly's fortnightly CSV export as her own copy of hours.
- **Privacy:** location is captured only at clock-in and clock-out. Staff can see their own recorded location. An in-app notice explains what is collected and why.
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
- Gladys rosters and approves swaps and covers for all cleaners, acting on Carly's behalf. She still sees records (photos, notes, hours) only for her own group. *(Changed 29 Oct 2026.)*
- Every staff member uses their own smartphone with mobile data. Reception inside the gym is good.

### Open questions

- [ ] Exact headcount and names for account setup.
- [ ] Who sends staff the written location notice 14 days before the trial starts?
- [ ] Trial start date.
- [ ] Exact gym coordinates and the radius to use (default 150 m).
