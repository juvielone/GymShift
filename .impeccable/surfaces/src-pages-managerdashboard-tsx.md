---
version: 1
slug: "src-pages-managerdashboard-tsx"
primary_target: "src/pages/ManagerDashboard.tsx"
related_targets: ["src/components/manager"]
---

# Manager dashboard (Grouped Sections)

Mode: Operate. Audience: Carly (manager), phone for quick approvals and laptop for reviewing flags and the fortnightly export. Job: see what needs her first (requests, flags, supplies), then today's shifts, then fortnight hours and CSV export.

Scope: production screen on mock data. Approve/decline extra time (cap from settings, blocked past the max with a reason) and swaps/covers (cover needs a person picked from available cleaners); flag sheet with clock event, location, corrections history, correct time with required reason (appends a correction), mark resolved; supply notes Done; Today panel; fortnight hours + CSV export (corrected times). Role routing: manager opens here. Gladys gets a Team swaps section on her cleaner home using the same request rows.

Decisions: Approve/Decline commit after a 5-second Undo (a request is decided once). Approve buttons are ink (many per view); red only for the single primary inside a sheet. Empty sections stay as one line ("No requests") so Carly trusts they were checked. Wide screens: two columns (Needs you | Today + Hours).

## Direction contract

THESIS: A calm to-do list, not a control room: three short sections that say exactly what needs Carly and let her finish each in a tap. Refuses the KPI-tile admin dashboard.

OWN-WORLD: The GymShift system (DESIGN.md): white ground, ink, Geist tabular, hairline rows with tinted icon discs (amber = check, neutral = request/supply), ink count badges on section headings, black pass for Today, red only on a sheet's single primary action.

STORY: Carly sees a count of what needs her, decides requests without leaving the list, checks flags with the facts and corrects time with a reason, ticks off supplies, glances at who's on, exports hours on payday.

FIRST VIEWPORT: Top bar (wordmark + site, initial); "Hi Carly" + date + "7 things need you"; Requests (count) with inline Decline/Approve; Flags to check (count) rows with chevron; Supplies (count) with Done. Desktop: Supplies tops the right column (so every "needs you" section is in the first view), then the Today pass and Fortnight hours; requests and flags span the left.

FORM: Grouped sections, structure 3 of 7 (dealt), seed: seed:55bdc7cfbaad08a4. Signature move: a decision settles in place: the row turns into "Approved · Undo" with a 5-second draining hairline, then folds away. Motion: fold/fade on settle, sheet slide (vaul); reduced motion removes the drain animation and folds instantly.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
