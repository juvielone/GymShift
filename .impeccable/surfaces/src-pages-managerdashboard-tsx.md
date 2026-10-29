---
version: 1
slug: "src-pages-managerdashboard-tsx"
primary_target: "src/pages/ManagerDashboard.tsx"
related_targets: ["src/components/manager"]
---

# Manager dashboard (Pass + List by Day) — redesign

Mode: Operate. Audience: Carly (manager), phone for quick approvals and laptop for reviewing flags and the fortnightly export. Redesigned 29 Oct 2026 because the Grouped Sections build buried Today and Hours and scrolled too much on a phone. The user steered the round: "one list, filters with its chips, but a black pass on top with who is assigned for shifts today"; chose "Pass + List by Day"; rows stay full read (reason + inline Approve/Decline).

Scope: same functions as before (requests with 5 s Undo, cover picker, extension cap; flag sheet with corrections and resolve; supplies Done; Today; fortnight hours + CSV). Composition change only: one filtered list grouped by day, Today pass on top, hours folded into one row that opens a sheet.

Decisions: Approve buttons ink; red only on a sheet's single primary. Filter chips (All · Requests · Flags · Supplies with counts) stay pinned while scrolling. Each filter's empty state is one line. Wide screens: chips + list left; Today pass + hours row right.

## Direction contract

THESIS: One honest list of what needs Carly, newest day first, under a pass that says who is working today. Refuses separate boxes per type and long inline tables.

OWN-WORLD: The GymShift system (DESIGN.md): white ground, ink, Geist tabular, hairline rows with tinted discs (amber = check, neutral = request/supply), ink filter chips with counts, quiet day labels, the black Today pass as the one pass, red only on a sheet's single primary action.

STORY: Carly sees who is on today, filters the list if she wants, decides today's items first, then older ones, ticks off supplies, and opens hours only on payday.

FIRST VIEWPORT: Top bar (wordmark + site, avatar); "Hi Carly" + date + "7 things need you"; black Today pass (one row per assigned person with Done / On shift / Not in yet / Starts chips); chips All 7 · Requests 2 · Flags 4 · Supplies 1; "Today" label with the first full-read request row. Desktop: chips + list left, Today pass and the Fortnight hours row right.

FORM: Pass + list by day, structure 7 of 7 (dealt, steered re-roll 2), seed: seed:55bdc7cfbaad08a4. Signature move: a decision settles in place: "Approved · Undo" with a 5-second draining hairline, then the row folds away. Motion: fold on settle, sheet slide (vaul), filter switch without page jump; reduced motion removes drain and fold.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
