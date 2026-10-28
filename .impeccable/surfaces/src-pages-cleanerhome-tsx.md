---
version: 1
slug: "src-pages-cleanerhome-tsx"
primary_target: "src/pages/CleanerHome.tsx"
related_targets: ["src/components/home"]
---

# Cleaner home (Shift Pass)

Mode: Operate. Audience: cleaners on their own phones at shift start/end and mid-task; several read English as a second language. Job: clock in/out in one tap, see shift progress, ask for extra time, see next shifts.

Scope: production screen on mock data. Clock in/out with browser location, extension request sheet, every state (before, on shift, extension pending/approved/declined, past approved finish, done, no shift/unscheduled, locating, location ok/off-site/denied/timeout/unavailable, network error). Out: photos, notes, swaps, bottom nav, login.

Decisions: clock-out asks "Clock out now?" only before the shift's finish time; one tap at/after finish. Dev-only switcher (person + mock time), never in production.

## Direction contract

THESIS: Today's shift is a pass you carry: one black card that tells you everything about tonight, one red button that does the one job. Refuses the category's round timer button and card-soup dashboard.

OWN-WORLD: White ground, near-black ink (#111), Geist with tabular numerals. Club red (#D7192A) only on the primary action and the live "On shift" dot. Amber for "Carly will check", green tick for "At the gym". Black pass card with rounded 18px corners; hairline rows; stacked upcoming cards. Brand = "World Gym" text wordmark until official assets.

STORY: The cleaner sees whether they are on, how long they've worked, where the finish line is, and that their record is safe. They tap once and are reassured warmly by name. Problems are notes for Carly, never blocks.

FIRST VIEWPORT: Top bar (wordmark + site name as the issuer line, initial right; site moved here from the pass header because "type · site" truncates at 390px); "Hi Maria" + date; black Shift Pass (shift type, status chip, 7:00 – 10:00 pm large, progress line with 3h mark and dotted 30-min extra zone, Worked / Left); location row; extra-time row; Next shifts as three stacked cards; red 58px Clock in/out button docked at the bottom in thumb reach.

FORM: Wallet-style pass stack, structure 3 of 7 (dealt lead), surface seed; direction world from the canon path. seed: seed:a6e76020a696d0ce. Signature move: the progress line (3h finish mark that moves with approved extra time, dotted extra zone, fills past the mark honestly, never cut). Motion: the button confirms with one tick-draw and the pass status crossfades; the line eases on minute ticks; all respect reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
