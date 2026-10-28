---
name: GymShift
description: Today's shift as a pass you carry; one black card that says everything, one red button that does the one job.
colors:
  brand: "#d7192a"
  brand-press: "#b5121f"
  brand-foreground: "#ffffff"
  pass: "#111111"
  pass-foreground: "#ffffff"
  pass-muted: "#c4c4cc"
  pass-line: "#3f3f46"
  pass-zone: "#71717a"
  warn: "#92400e"
  warn-soft: "#fef3c7"
  ok: "#15803d"
  ok-soft: "#dcfce7"
  background: "oklch(1 0 0)"
  foreground: "oklch(0.18 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.45 0 0)"
  border: "oklch(0.922 0 0)"
typography:
  display:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\""
  headline:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
  action:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.55
  section:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.375
  body-secondary:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.375
  action-inline:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.2
  detail:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.375
  label:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.2
  count:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "22px"
  wordmark:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    letterSpacing: "0.08em"
rounded:
  sm: "8px"
  control: "14px"
  pass: "18px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  gutter: "16px"
  pass: "18px"
  section: "20px"
  section-wide: "24px"
  gutter-wide: "40px"
  column-gap: "48px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-foreground}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    height: "58px"
    width: "100%"
  button-primary-active:
    backgroundColor: "{colors.brand-press}"
  button-sheet-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-foreground}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    height: "56px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    height: "56px"
  button-inline-ink:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    typography: "{typography.action-inline}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 16px"
  button-inline-ink-disabled:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
  button-inline-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.action-inline}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 16px"
  button-text:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    height: "44px"
  count-badge:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    typography: "{typography.count}"
    rounded: "{rounded.full}"
    padding: "0 6px"
    width: "22px"
  shift-pass:
    backgroundColor: "{colors.pass}"
    textColor: "{colors.pass-foreground}"
    rounded: "{rounded.pass}"
    padding: "18px"
  status-chip:
    backgroundColor: "{colors.pass-foreground}"
    textColor: "{colors.pass}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "6px 10px"
  status-chip-quiet:
    backgroundColor: "{colors.pass-line}"
    textColor: "{colors.pass-foreground}"
  status-chip-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
  status-row:
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    padding: "12px 4px"
  undo-row:
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    padding: "12px 4px"
  cover-select:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-secondary}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 12px"
  upcoming-card:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "14px 16px"
  receipt-ok:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.pass}"
    padding: "14px 16px"
  receipt-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.pass}"
    padding: "14px 16px"
  choice-chip:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    height: "48px"
  choice-chip-selected:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
---

# Design System: GymShift

## Overview

**Creative North Star: "The Shift Pass"**

Today's shift is a pass you carry. One near-black card holds everything about the shift (what it is, where it is up to, where the finish line sits, how long you have worked), and one red button docked in thumb reach does the one job. Everything else sits quietly on a white ground in hairline rows and plain words. The world borrows its calm from wallet passes and banking confirmations, and its colour from the club itself: black iron, red frames, white floor.

The system is light and phone-first. Density is low on purpose: big tabular numerals, 15 to 16px text, 44px+ touch targets, one idea per row. The brand appears only in small deliberate places (the red action, the red live dot, the uppercase text wordmark). Problems are never red and never blocks; they are amber notes for a person to check, and the record is always reassured as saved. The same world carries two surfaces: the cleaner's home (one pass, one docked red action) and the manager's dashboard, a calm to-do list of grouped hairline sections where many small decisions are ink, today's roster is the one black pass, and red waits inside a sheet.

The brand layer is **interim**. It approximates World Gym's black/red/white until official assets arrive and is isolated in one block of custom properties so it can be swapped (or neutralised for the portfolio version) without touching components.

**Key Characteristics:**
- One black pass per screen: the Shift Pass with its progress line on the cleaner home, the Today pass on the dashboard.
- At most one red action per view or sheet; repeated decisions in a list are ink.
- Hairline rows with soft tinted icon discs for status; grouped sections with ink count badges, no card soup.
- Geist with tabular numerals everywhere; times and durations are the heroes.
- Amber means "a person will look at this"; green means "saved and fine"; red means "do it" or "live".
- Motion confirms, never decorates; every movement has a reduced-motion fallback.

## Colors

A near-monochrome working ground with one strong brand red and two gentle signal tints.

### Primary
- **Club Red** (`brand`): the single primary action of a view or sheet (Clock in, Clock out, Send, Mark resolved, Save correction) and the 7px live dot in every "On shift" chip. Also the text caret colour. Interim World Gym approximation.
- **Pressed Red** (`brand-press`): pressed and busy state of the red button.
- **White on Red** (`brand-foreground`): label on the red button.

### Secondary
- **Pass Black** (`pass`): the pass surface (Shift Pass, Today pass) and the text-selection highlight. The brand's black half.
- **Pass White** (`pass-foreground`): numerals on the pass, the progress fill, the finish mark, the live status chip ground.
- **Pass Grey** (`pass-muted`): secondary text on the pass (shift type, legend, stat labels, the "Today" heading, roster detail lines).
- **Pass Rule** (`pass-line`): the progress track, dividers on the pass, and the ground of quiet chips ("Starts in", "Done", "Starts 7:00 pm").
- **Zone Dash** (`pass-zone`): the dotted extra-time zone on the progress line. A brand-layer custom property like the rest of the pass family.

### Tertiary (signal tints)
- **Check Amber** (`warn` on `warn-soft`): anything a person will look at (no location, away from the gym, not rostered, over approved time, extension waiting, "Not in yet", "On shift now · not counted yet"), the flag-row discs on the dashboard, and "Not saved yet" notes. Gentle, never alarming.
- **Saved Green** (`ok` on `ok-soft`): "At the gym", approved extra time, the clean clock-in/out receipt, and an approval that has just been saved.

### Neutral
- **Paper White** (`background`): page, rows, upcoming cards, sheets, the dock, outline buttons, the text on ink buttons and badges.
- **Ink** (`foreground`): all primary text, the focus ring, the selected choice chip, inline Approve and Export buttons, section count badges, the Undo drain hairline.
- **Soft Grey** (`muted`): neutral icon discs (requests, supplies, a pending decision), tucked upcoming cards, the initial avatar, pressed rows, disabled buttons, skeletons.
- **Quiet Grey** (`muted-foreground`): dates, details, secondary labels, chevrons, empty-section lines, text buttons. Darkened from the shadcn default for small-text legibility.
- **Hairline** (`border`): row dividers, card outlines, outline buttons, the cover picker, the dock's top edge.

### Named Rules
**The Red Means Go Rule.** Red appears only on the one primary action of a view or sheet and on the live "On shift" dot. Where a list holds many approvals (requests on the dashboard, team swaps on a lead's home), Approve is ink, so red stays one per view and one per sheet. Red is never a problem, error, warning, decline or decoration colour. The shadcn `destructive` token is not part of this system.

**The Note For Carly Rule.** Every flag, location problem or failure is amber and never blocks an action. Cleaners read it as "Carly will check it" with reassurance that time is saved; Carly reads the same flag as a neutral fact to check ("Priya · away from the gym"), never an accusation.

**The Swappable Brand Rule.** Brand colour lives only in the brand layer (`--brand`, `--brand-press`, `--brand-foreground`, `--pass`, `--pass-foreground`, `--pass-muted`, `--pass-line`, `--pass-zone`). These are the tokens to replace when official World Gym assets arrive; the wordmark text is the asset to replace with the official logo. No component hardcodes a brand hex.

## Typography

**Display Font:** Geist Variable (with sans-serif)
**Body Font:** Geist Variable (with sans-serif)

**Character:** One modern grotesk at every size, with tabular numerals set on the body so times and durations never jitter. Weight and size carry hierarchy; there is no second family.

### Hierarchy
- **Display** (600, 34px, 1.1, -0.02em): the shift time range on the Shift Pass ("7:00 – 10:00 pm", "Since 7:40 pm"). At most one per screen.
- **Headline** (600, 28px, 1.25, -0.01em): the greeting ("Hi Maria", "Hi Carly"). The "No shift today" card title steps down to 24px.
- **Title** (600, 20px): sheet titles and the Worked / Left numbers on the pass.
- **Action** (600, 18px): labels of full-width 56 to 58px buttons.
- **Section** (600, 16px): section headings ("Requests", "Flags to check", "Supplies", "Fortnight hours", "Next shifts").
- **Body** (500, 16px, 1.375): row titles, upcoming shift dates, chips, receipt titles, Today pass names.
- **Body secondary** (400, 15px): dates, pass notes, receipt detail, sheet descriptions, quoted reasons, flag-sheet facts, empty-section lines, hours table.
- **Action inline** (600, 15px): labels of 44px inline row buttons (Approve, Decline, Done, Undo, Export CSV).
- **Detail** (400, 14px): row details, helper text, the unrostered dock note.
- **Label** (500, 13px): pass legend ("In 6:57 pm", "Finish 9:57 pm"), stat labels, footnotes. Status chips set it at 600.
- **Count** (600, 13px, 22px line): the ink count badge after a section heading.
- **Wordmark** (700, 15px, 0.08em, uppercase): "WORLD GYM" text wordmark only, followed by the site name in 15px Quiet Grey as the issuer line.

### Named Rules
**The Numbers Lead Rule.** Times and durations are the largest thing in any block and always tabular. Durations read "43 min", "2h 17m", "3h"; times read "7:00 pm" with one am/pm per range.

**The Uppercase Is The Wordmark Rule.** Uppercase tracking is reserved for the interim text wordmark. No other label is set in caps.

## Layout

On a phone every surface is a single centred column, max 480px wide, 16px side gutters, `min-height: 100svh`. Cleaner home order: top bar (48px tall), greeting, optional receipt banner, the pass, status rows, next shifts. The primary button docks to the bottom in a fixed white bar with a hairline top edge (12px top padding, safe-area inset plus 16px bottom); the page reserves safe-area plus 112px of bottom padding while the dock is present. Dashboard phone order: top bar, greeting with the date and "N things need you", then Requests, Flags to check, Supplies, the Today pass (32px above it), Fortnight hours. The dashboard has no dock.

From the `lg` breakpoint (1024px) the dashboard widens to a 1152px container (max-w-6xl) with 40px gutters and a two-column grid: a flexible left column and a 360px right column, 48px apart. Requests and Flags to check sit on the left, spanning both grid rows; Supplies sits at the top of the right column, with Today and Fortnight hours below it, so every "needs you" section is in the first view. Request rows go horizontal at this width: text left, Decline / Approve right, "asked" time folded into the detail line. Sheets stay 480px wide on every screen. The cleaner home keeps its 480px column at all widths.

Rhythm is a 4px base: 4 / 8 / 12 / 16 / 20 / 24px. Cleaner-home blocks are separated by 16px (pass, receipt) or 20px (Next shifts); dashboard sections by 24px, with headings 6px above their first hairline. Rows pack at 12px vertical padding with a 12px icon gap; the pass pads 18px. Sheets use 20px between fieldsets and 8px between chips. Touch targets are never under 44px: inline row buttons, nav arrows and the cover picker are 44px, chips 48px, tappable rows at least 56px, full-width buttons 56 to 58px.

## Elevation & Depth

Mostly flat, white on white, with depth reserved for the things you "carry".

### Shadow Vocabulary
- **Pass lift** (`box-shadow: 0 8px 24px -12px rgb(0 0 0 / 0.45)`): the black pass only (Shift Pass, Today pass), so it reads as an object sitting on the page.
- **Card lift** (`box-shadow: 0 2px 6px -2px rgb(0 0 0 / 0.08)`): each upcoming-shift card, so the tucked stack reads as layered passes.

Rows, sections, the dock, banners, badges and chips have no shadow; they separate with hairlines or tint. Sheets use the shadcn drawer's overlay.

### Named Rules
**The Only Objects Cast Rule.** Only pass-like objects (the black pass and upcoming cards) cast shadows. Everything else is flat.

## Shapes

Two corner radii do almost all the work: **pass corners** (18px) for the black pass, the empty "No shift today" card and receipt banners; **control corners** (14px) for every button (full-width and inline), upcoming cards, choice chips, the cover picker, the time input, the network alert and empty-state panels. Pills (full) are reserved for status chips, count badges, icon discs, the avatar and the progress track. Rows and sections are square-edged with only a bottom hairline. Borders are 1px hairlines; the one 2px border is the outlined unrostered clock-in button, and the one 2px line is the Undo drain.

## Components

### Buttons
Flat and calm in two sizes: full-width for the one job, 44px inline for the many small ones.
- **Shape:** control corners (14px) at both sizes.
- **Primary (docked):** Club Red, White label, 58px tall, full column width, Action type. Pressed: Pressed Red plus `scale(0.99)` over 150ms. Busy: Pressed Red with a spinner and the step in words ("Checking your location…", "Saving…"). Saved: a white tick draws itself and the label reads "Saved" for 1.4s before settling.
- **Primary (sheet footer):** same red, 56px tall, with a spinner while busy. Disabled falls back to Soft Grey with Quiet Grey text, never faded red.
- **Outline (full width):** Paper White with a 1px Hairline border, 56px (sheet "Keep working", "Try again", "Correct time"), or a 2px Ink border on the dock when the person is not on the roster today, so an unrostered clock-in is available but not promoted.
- **Inline ink:** Ink ground, Paper White label, 44px tall, 16px side padding, Action inline type. Approve ("Approve", "Approve 20 min") and Export CSV (full width, with an 18px download icon). Pressed drops to 85% ink; disabled falls back to Soft Grey with Quiet Grey text (Approve stays disabled until a cover person is picked).
- **Inline outline:** Paper White with a 1px Hairline border, same 44px size and type. Decline, Done, Undo, Try again; the fortnight arrows are 44px square versions with a 20px chevron.
- **Text button:** no ground or border, 44px, 16px medium Quiet Grey; flashes Soft Grey on press. Cancel in a sheet that is mid-edit.
- **Focus:** 2px Ink outline, 2px offset, on every interactive element.

### Chips
- **Status chip (on the pass):** pill, 13px semibold, 6px by 10px. Live: white ground, black text, leading 7px red dot ("On shift"). Done: Pass Rule ground, white text, leading check. Quiet: Pass Rule ground, white text ("Starts in 1h 20m", "Starts 7:00 pm"). Warn: Check Amber tint with amber text ("Not in yet"). On the Shift Pass it crossfades when the state changes.
- **Choice chip (sheets):** 48px tall, control corners, Hairline border on white. Selected inverts to Ink ground with white text (`aria-pressed`). Never red.

### Cards / Containers
- **Corner Style:** control corners (14px) for upcoming cards; pass corners (18px) for the pass.
- **Background:** Paper White; tucked cards in the stack drop to Soft Grey.
- **Shadow Strategy:** Card lift (see Elevation).
- **Border:** 1px Hairline.
- **Internal Padding:** 14px vertical, 16px horizontal; 18px icon, 12px gap.

### Status Rows
Hairline list rows, not cards. A 36px tinted icon disc (Saved Green, Check Amber or Soft Grey with an 18px stroke icon), a 16px medium title, a 14px Quiet Grey detail, and a chevron only when the row opens something. Tappable rows are at least 56px and flash Soft Grey on press. The dashboard uses the same row: flags carry amber discs and a chevron ("Tomas · over approved time" over "Mon 26 Oct, 10:42 pm · detail"); requests and supplies carry neutral discs with inline buttons at the end (phone: under the text; wide: to the right). A request quotes its reason in 15px body; a blocked approval explains itself in 14px amber and offers only Decline.

### Sections
A 16px semibold heading followed, when the count is above zero, by an **ink count badge**: a pill at least 22px wide, Ink ground, 13px/600 Paper White numeral, 6px side padding. An empty section stays as one 15px Quiet Grey line on a hairline ("No requests to decide.", "No flags. Every clock-in looks fine.") so the reader trusts it was checked.

### Inputs / Fields
- **Textarea:** the shadcn textarea at 16px text (no iOS zoom), used under quick-reason chips ("Or write your own reason"; "Reason (needed)" in the flag sheet). Quick chips are the expected path; typing is optional.
- **Cover picker:** a native select inside the request row, 44px tall, full width, control corners, 1px Hairline border on Paper White, 15px text, 12px side padding, placeholder "Who covers?".
- **Time input:** native time field, 48px tall, control corners, Hairline border, 18px semibold value.

### Drawers / Sheets
Bottom drawers (shadcn/vaul), max 480px, left-aligned header: 20px semibold title, 15px description that states the consequence or fact in plain words. Footer stacks the red primary over a secondary. Used for "Ask for extra time" (amount chips, reason chips, Send · 20 min), "Clock out now?" (only before the approved finish) and the flag sheet.

### Flag Sheet
Title "Name · neutral label", the flag detail as description, then the facts as a hairline-divided list: 15px Quiet Grey term left, 15px medium value right (Shift, Clock-in or Clock-out with "Recorded 7:12 pm" in 13px under a corrected time, Location in metres with accuracy). Past corrections follow as "7:12 pm → 7:00 pm · "reason"" lines. Footer: red "Mark resolved" over a 56px outline "Correct time". While correcting, the facts collapse to one summary line between hairlines ("Clock-in now 7:03 pm · Tue 27 Oct"), the time input, quick-reason chips and the reason field appear, and the footer becomes red "Save correction" (disabled until the time changes and a reason is given) over a text-button Cancel. Red stays single in each state.

### Undo Row (signature, dashboard)
A decision settles in place. Tapping Approve or Decline turns the row into a status line: a neutral Soft Grey disc with an ink check (approve) or X (decline), "Approved" or "Declined" in 16px medium followed by "· title" in Quiet Grey, an inline outline Undo button, and a 2px Ink hairline along the bottom edge that drains from full width to nothing over 5 seconds, linear. When the drain ends the decision saves; the approved disc turns Saved Green, the row holds for 600ms, then folds closed (grid rows 1fr to 0fr with opacity 1 to 0, 450ms, `cubic-bezier(0.16, 1, 0.3, 1)`). A saved row never offers Approve or Decline again. Under reduced motion there is no drain and the saved row is removed at once. Leaving the screen saves anything still waiting.

### Today Pass (dashboard)
The dashboard's one black pass: pass corners, Pass lift, 18px padding, a 15px medium Pass Grey "Today" heading, then one row per rostered shift divided by Pass Rule hairlines. Each row: 16px medium first name with "· Morning/Night" in Pass Grey, a 14px Pass Grey line ("In 6:57 pm · 43 min", "In 7:00 am · Out 9:58 am", "Was due 7:00 pm", or the time range), and a status chip on the right (live, done, quiet or warn). No progress line here; that belongs to the Shift Pass.

### Fortnight Hours
A section heading with the date range in 14px Quiet Grey and 44px square previous / next arrows; a hairline table of 15px names and right-aligned 600 totals in "2h 58m" form; open sessions listed in 13px amber ("On shift now · not counted yet") and not added in. A full-width inline ink Export CSV, then a 13px Quiet Grey footnote: "Uses corrected times. Hours are never cut." The CSV keeps exact minutes as the record (rostered, unscheduled, total); "Total (H:MM)" and decimal hours are derived columns, and decimal hours round up, never down.

### Upcoming Stack
"Next shifts" shows the first three cards tucked under each other: each later card overlaps by 8px, scales down 3% per step and sits on Soft Grey. "Show all N" fans them into a list with 8px gaps over 300ms; the chevron flips.

### Receipt Banner
The confirmation after any clock or request, placed under the greeting, announced via a polite live region. Pass corners, 14px by 16px padding, Saved Green or Check Amber tint, a tinted circle with a drawn tick (in both tones, because the time is saved either way), a 16px semibold title that uses the first name ("You're clocked in, Maria."), a 15px detail at 80% ink, and a 40px dismiss target. Auto-dismisses after 12 seconds.

### The Shift Pass (signature)
A near-black card with pass corners and Pass lift. Header row: shift-type icon plus "Night shift" in Pass Grey, status chip right. Then the Display time range, the progress line, the legend (In / Finish or Out), a Pass Rule divider and the Worked / Left (or Over) stats at 20px. Before the shift it says "Tap Clock in when you arrive."; with no shift today it becomes an outlined white card ("No shift today", next shift line).

**The progress line** is the system's signature: a 6px Pass Rule track; a white fill for worked time; a 2px by 16px white **finish mark** at the approved length; and a **dotted extra zone** (3px dash, 3px gap, Zone Dash) from the approved length to the maximum shift length, showing time that could still be approved. Approving extra time moves the mark into the zone. Past the mark the fill keeps going and the scale grows with it. Unscheduled sessions show the fill only, with no mark or zone. Fill and mark ease over 700ms on minute ticks.

### Named Rules
**The Never Cut Rule.** Nothing on screen or in an export clips, caps or rounds worked time down. Past the mark the progress line keeps filling and the stat reads "Over"; hours totals and the CSV use exact corrected minutes, with H:MM and decimal hours derived from them and decimals rounded up.

**The One Pass Rule.** One black pass per screen. Other information goes in rows, sections or white cards, never a second black card.

**The Settle In Place Rule.** A decision in a list is made in the row, waits 5 seconds with Undo, then settles and folds away. It is never re-offered and never sent to another screen to confirm.

### Motion
- Pass state content and the status chip fade in over 500ms (`motion-safe` only).
- Receipt banner fades and slides 8px down over 300ms (`motion-safe` only).
- The confirmation tick draws once: 450ms, `cubic-bezier(0.16, 1, 0.3, 1)`, 120ms delay. Under reduced motion it renders complete.
- Progress fill and mark: 700ms ease-out; stack fan: 300ms ease-out; both disabled under reduced motion.
- Undo drain: 5s linear; none under reduced motion. Settle fold: 600ms hold, then 450ms `cubic-bezier(0.16, 1, 0.3, 1)`; instant under reduced motion.
- Button press: 150ms background and 0.99 scale.
- Sheets slide with the vaul drawer.

### Voice
Short sentences, common words, no idioms or slang (several readers have English as a second language). Use the first name in confirmations. State what happened, then what happens next: "We couldn't get your location when you clocked in. Carly will check it." Errors say "Not saved yet. Check your internet and try again." or "Not saved yet. Try again." Flag labels are neutral facts in lower case after the name: "away from the gym", "no location", "not rostered", "didn't clock in", "no clock-out", "over approved time". Never blame; never say "error", "violation" or "invalid".

## Do's and Don'ts

### Do:
- **Do** keep Club Red to the single primary action of a view or sheet and the 7px live dot.
- **Do** make Approve ink wherever a list holds more than one decision.
- **Do** use Check Amber for every flag; tell cleaners "Carly will check it" and that the time is saved, and show Carly a neutral fact.
- **Do** put today's shift in the Shift Pass with the progress line, finish mark and dotted extra zone, and today's roster on the dashboard in the Today pass.
- **Do** dock the primary button at 58px, full width, at the bottom in thumb reach, with the step written on the button while it works.
- **Do** confirm actions with a receipt banner that uses the first name and a drawn tick, and list decisions with the 5-second Undo row.
- **Do** head grouped sections with an ink count badge, and keep empty sections as one plain line.
- **Do** use tabular numerals and the duration format "2h 17m" everywhere.
- **Do** keep touch targets at 44px or more, rows at 56px when tappable, chips at 48px.
- **Do** guard every movement with `motion-safe` or a `motion-reduce` fallback.
- **Do** change brand colour only through the brand-layer tokens.

### Don't:
- **Don't** use red, or the shadcn `destructive` token, for errors, flags, warnings or declined states.
- **Don't** put a red button on every row of a list.
- **Don't** block or disable an action because of location, roster or time problems; flag it instead.
- **Don't** draw the progress line, stats, totals, exports or copy in a way that cuts, caps or rounds worked time down.
- **Don't** use a round timer button, KPI tiles or a dashboard of many cards.
- **Don't** add a second black pass or put shadows on rows, sections, banners or the dock.
- **Don't** recreate, trace or approximate the World Gym logo; use the text wordmark until the official file arrives.
- **Don't** set labels in uppercase other than the wordmark, and don't add small caps labels above headings.
- **Don't** use idioms, slang or blame words in any copy.
