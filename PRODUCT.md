# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

About 7 people at one site, the World Gym Macquarie Park cleaning team. Each person uses their own smartphone on mobile data.

- **Cleaners (about 5).** They work 3-hour morning (around 7:00 am) or night (around 7:00 pm) shifts. On a phone, often mid-task, they clock in and out, upload up to 10 work photos, leave shift notes, set availability, and request swaps, covers and extensions. **Several read English as a second language.**
- **Team lead (Gladys).** Does everything a cleaner does, and also rosters and approves swaps and covers for their own group.
- **Manager (Carly).** Builds and publishes the roster for all staff, approves extensions, reviews flags, corrects attendance times, resolves supply notes, and exports fortnightly hours for pay.

## Product Purpose

GymShift replaces WhatsApp clock photos and chat messages with one record of rosters, hours and cleaning evidence. Success at the end of the 4-week trial means:

- one full fortnightly pay cycle is calculated from app data with no disputes;
- WhatsApp is no longer used for clock photos or work photos;
- Carly and Gladys publish and change the roster in the app.

## Positioning

GymShift is built for one small team's real rules, not as a generic workforce suite. Hours are never cut automatically, and unusual entries are flagged for a human to review instead of being blocked. Every change sits on an append-only audit trail, so pay can be argued from records rather than photos.

## Operating Context

- Staff use the app at the gym, at the start and end of each shift, and in between to upload photos or leave notes. Reception inside the gym is good.
- Location is captured only at the moment of clocking in or out, never continuously. Staff get written notice of this 14 days before capture starts (NSW workplace surveillance), and an in-app notice explains what is collected and why.
- The roster and pay period is fortnightly. Carly exports hours as a CSV and pays from it. Payroll itself happens outside the app.
- This is a free portfolio trial built and maintained by Juvie. With Carly's permission it may appear in a portfolio with names and locations removed.

## Capabilities and Constraints

[docs/PRD.md](docs/PRD.md) is the source of truth for features (F1–F9), the role table and business rules. [CLAUDE.md](CLAUDE.md) holds the engineering rules. Durable facts that shape any UI:

- **Terminology:** shift (morning/night), roster (draft → published), clock in / clock out, swap, cover, extension, flag, correction, shift note (Supplies low / Issue / General), work photos, fortnight.
- **Flag, don't block.** Off-site, no-location and unscheduled clock events always save and then raise a flag. Poor GPS accuracy alone never flags.
- **Never cut hours.** Time over 3h without an approved extension is flagged, never reduced. Extensions can't be approved beyond 3.5h in total.
- **Never overwrite.** Corrections, roster changes and decisions are new records showing who, when, the old value and the new value.
- **Server time only.** The phone's clock is never trusted.
- **Three taps or fewer** for every staff action. Tested on iOS Safari and Android Chrome. Clock-in completes within 5 seconds on mobile data.
- Out of scope for v1: push notifications, offline clock-in, checklists, payroll, multiple sites, native apps.
- **Open:** cleaner names and headcount, gym coordinates and radius (default 150 m), trial start date, and who sends the location notice.

## Brand Commitments

- **World Gym-adjacent look, for now.** The app should feel like it belongs to World Gym Macquarie Park. Official logos and brand assets will be supplied later; until then, the look only approximates World Gym and must not use a recreated or traced logo. When the real assets arrive, they replace the approximation.
- **Interim visual reference: [docs/brand/world-gym-reference.png](docs/brand/world-gym-reference.png)**, a screenshot of the club's public listing (logo and interior photos). It is a reference only and never ships in the app. What it shows, and what the app takes from it until official assets arrive:
  - **Palette:** the club itself is black, red and white. The walls and equipment are black, the dumbbell rims, punching bags and machine frames are a strong red, and the logo, floor and ceiling are white or light grey. Black and red are the brand pair; white is the working ground.
  - **Logo:** a black-and-white circular badge (a gorilla holding a globe, with "WORLD GYM" lettering). Never recreate, trace or approximate it. Until the official file arrives, use a plain text wordmark ("World Gym", set in the app's own type) in its place.
  - **Character:** heavy, physical, no-nonsense: iron, rubber and bold numerals (like the "27.5kg" printed on the plates). Not pastel, not soft, not techy.
  - Red is the brand accent. It must not double as the "problem" colour, so flags and warnings need their own distinct, gentler signal.
- **Design stance (confirmed 29 Oct 2026): user-friendly, clear and minimal, with subtle, intentional modern design.** The client chose familiar app conventions done with care over an expressive visual concept. The bar for clarity and polish is Deputy and Connecteam (shift apps), CommBank (calm, readable, strong confirmations) and Apple Wallet and Health (space, big readable numbers, subtle colour). We match their craft, not their look. The brand shows up in small, deliberate details, never in decoration.
- **Keep the brand swappable.** Brand colours, logo and name live in one replaceable layer (tokens and assets), because the portfolio version must remove names and locations. "GymShift" is a working product name.
- **Voice: warm and friendly**, personable and encouraging, using first names (for example "Nice one, Maria, you're clocked in"). It must stay in plain English: short sentences, common words, no idioms or slang, because several staff read English as a second language.
- Flags and corrections are never phrased as accusations. A flag is a note for review, not a mark against someone.

## Evidence on Hand

- Mock seed data for one fortnight (26 Oct – 8 Nov 2026) in `src/mocks/`. The names in it are placeholders, not real staff.
- [docs/brand/world-gym-reference.png](docs/brand/world-gym-reference.png): an interim visual reference (public listing screenshot). It is not a usable asset.
- Official World Gym logo files, brand colours and fonts have been requested from Carly but not yet supplied. No photography, testimonials or real staff names exist. Do not invent or recreate any of them.

## Product Principles

1. **Trust over policing.** The app records what happened and flags oddities for Carly. It never blocks a clock-in or quietly reduces someone's pay.
2. **The phone in the cleaner's hand comes first.** The core staff actions are fast, obvious and done in three taps, without training.
3. **Plain words, warm tone.** Every label is understandable to someone reading English as a second language.
4. **One record, no disputes.** Every time, change and decision is visible with who and when, so pay can be checked without photos.
5. **Carly sees what needs attention.** Manager surfaces lead with what needs action today, not with raw data.

## Accessibility & Inclusion

- Staff read English as a second language: use plain English, short labels and no idioms, and support text with recognisable icons where it helps.
- Mobile-only use on iOS Safari and Android Chrome. Touch targets must be comfortable for one-handed use on the move.
- Target WCAG 2.2 AA as the baseline (inferred default; not stated by the client).
