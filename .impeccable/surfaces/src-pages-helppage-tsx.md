---
version: 1
slug: "src-pages-helppage-tsx"
primary_target: "src/pages/HelpPage.tsx"
related_targets: ["src/pages/SignIn.tsx"]
---

# Questions & privacy (src/pages/HelpPage.tsx)

Scope: one public page opened from the "Help" link in the sign-in header and from the "Questions & privacy" row in the account sheet once signed in. Mode: Read. Holds how-to answers for the staff app (sign in, clocking, extra time, photos and notes, shifts, swaps and days off) and the location and privacy notice (PRD non-functional: in-app notice; NSW workplace surveillance notice it supports).

Audience and job: a cleaner, often reading English as a second language, with one question ("I forgot my PIN", "I can't make a shift") on a phone; the same page serves as the written location notice the manager sends. Constraints: public page, so no staff names ("your manager"); plain short sentences; facts from PRD and code only; start date and record-keeping length are open with the client (parked 3 Nov 2026).

## Direction contract

THESIS: The page is the staff induction handbook: a five-line contents list, then numbered chapters whose answers are short numbered steps. Refuses the help-centre default of a search box over topic tiles.

OWN-WORLD: GymShift's light world unchanged: white ground, ink text, Geist with tabular numerals, hairline rows, control corners 14px. Chapter numbers in Quiet Grey; chapter 5 (privacy) carries the only red, its numeral in the contents and on the chapter heading, the brand mark on the page that matters legally. No black pass on this page.

STORY: The reader scans five chapter names, jumps to one, opens a question and follows one to three steps. The privacy chapter reads as the notice itself: what is recorded, when, why, who sees it, how long.

FIRST VIEWPORT: 48px wordmark bar; "‹ Back" link; 28px "Questions & privacy" with one 15px line; the contents list as five 48px hairline rows numbered 1–5; then chapter 1's heading and its first question open with numbered steps.

FORM: staff handbook, position 6 on the ordered list (dealt lead). seed:f6a4cd10bb7f0f8b

Signature interaction: tapping a contents row scrolls to the chapter and the URL hash names it, so a link straight to "#help-privacy" is the notice; questions open in place with a 200ms height ease (motion-safe), one or many at a time.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
