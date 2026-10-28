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
  status-row:
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    padding: "12px 4px"
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

The system is light, single-column and phone-first. Density is low on purpose: big tabular numerals, 15 to 16px text, 48px+ touch targets, one idea per row. The brand appears only in small deliberate places (the red action, the red live dot, the uppercase text wordmark). Problems are never red and never blocks; they are amber notes that "Carly will check", and the record is always reassured as saved.

The brand layer is **interim**. It approximates World Gym's black/red/white until official assets arrive and is isolated in one block of custom properties so it can be swapped (or neutralised for the portfolio version) without touching components.

**Key Characteristics:**
- One black pass per screen, carrying the signature progress line.
- One red primary action per view, docked or in the sheet footer.
- Hairline rows with soft tinted icon discs for status; no card soup.
- Geist with tabular numerals everywhere; times and durations are the heroes.
- Amber means "a person will look at this"; green means "saved and fine"; red means "do it" or "live".
- Motion confirms, never decorates; every movement has a reduced-motion fallback.

## Colors

A near-monochrome working ground with one strong brand red and two gentle signal tints.

### Primary
- **Club Red** (`brand`): the primary action only (Clock in, Clock out, Send, Yes, clock out) and the 7px live dot in the "On shift" chip. Also the text caret colour. Interim World Gym approximation.
- **Pressed Red** (`brand-press`): pressed and busy state of the red button.
- **White on Red** (`brand-foreground`): label on the red button.

### Secondary
- **Pass Black** (`pass`): the Shift Pass surface and the text-selection highlight. The brand's black half.
- **Pass White** (`pass-foreground`): numerals on the pass, the progress fill, the finish mark, the status chip ground.
- **Pass Grey** (`pass-muted`): secondary text on the pass (shift type, legend, stat labels).
- **Pass Rule** (`pass-line`): the progress track, the divider above stats, and the "Starts in" chip ground.
- **Zone Dash** (`pass-zone`): the dotted extra-time zone on the progress line. Currently written inline in the source rather than in the brand layer.

### Tertiary (signal tints)
- **Check Amber** (`warn` on `warn-soft`): anything Carly will look at (no location, away from the gym, unscheduled, past approved time, extension waiting) and network "Not saved yet" notes. Gentle, never alarming.
- **Saved Green** (`ok` on `ok-soft`): "At the gym", approved extra time, and the clean clock-in/out receipt.

### Neutral
- **Paper White** (`background`): page, rows, upcoming cards, sheets, the dock.
- **Ink** (`foreground`): all primary text, the focus ring, the selected choice chip, the outlined button border.
- **Soft Grey** (`muted`): neutral icon discs, tucked upcoming cards, the initial avatar, pressed rows, skeletons.
- **Quiet Grey** (`muted-foreground`): dates, details, secondary labels, chevrons. Darkened from the shadcn default for small-text legibility.
- **Hairline** (`border`): row dividers, card outlines, the dock's top edge.

### Named Rules
**The Red Means Go Rule.** Red appears only on the one primary action of a view and on the live "On shift" dot. It is never a problem, error, warning or decoration colour. The shadcn `destructive` token is not part of this system.

**The Note For Carly Rule.** Every flag, location problem or failure is amber, phrased as "Carly will check it", and paired with reassurance that time is saved. Amber never blocks an action.

**The Swappable Brand Rule.** Brand colour lives only in the brand layer (`--brand`, `--brand-press`, `--brand-foreground`, `--pass`, `--pass-foreground`, `--pass-muted`, `--pass-line`). These are the tokens to replace when official World Gym assets arrive; the wordmark text is the asset to replace with the official logo. No component hardcodes a brand hex.

## Typography

**Display Font:** Geist Variable (with sans-serif)
**Body Font:** Geist Variable (with sans-serif)

**Character:** One modern grotesk at every size, with tabular numerals set on the body so times and durations never jitter. Weight and size carry hierarchy; there is no second family.

### Hierarchy
- **Display** (600, 34px, 1.1, -0.02em): the shift time range on the pass ("7:00 – 10:00 pm", "Since 7:40 pm"). One per screen.
- **Headline** (600, 28px, 1.25, -0.01em): the greeting ("Hi Maria"). The "No shift today" card title steps down to 24px.
- **Title** (600, 20px): sheet titles and the Worked / Left numbers on the pass.
- **Action** (600, 18px): labels of full-width buttons.
- **Body** (500, 16px, 1.375): row titles, upcoming shift dates, chips, receipt titles, section heading "Next shifts".
- **Body secondary** (400, 15px): dates, pass notes, receipt detail, sheet descriptions.
- **Detail** (400, 14px): row details, helper text, the unrostered dock note.
- **Label** (500, 13px): pass legend ("In 6:57 pm", "Finish 9:57 pm"), stat labels, the status chip.
- **Wordmark** (700, 15px, 0.08em, uppercase): "WORLD GYM" text wordmark only, followed by the site name in 15px Quiet Grey as the issuer line.

### Named Rules
**The Numbers Lead Rule.** Times and durations are the largest thing in any block and always tabular. Durations read "43 min", "2h 17m", "3h"; times read "7:00 pm" with one am/pm per range.

**The Uppercase Is The Wordmark Rule.** Uppercase tracking is reserved for the interim text wordmark. No other label is set in caps.

## Layout

A single centred column, max 480px wide, 16px side gutters, `min-height: 100svh`. Order on the home surface: top bar (48px tall), greeting, optional receipt banner, the pass, status rows, next shifts. The primary button docks to the bottom in a fixed white bar with a hairline top edge (12px top padding, safe-area inset plus 16px bottom); the page reserves safe-area plus 112px of bottom padding while the dock is present.

Rhythm is a 4px base: 4 / 8 / 12 / 16 / 20px. Blocks are separated by 16px (pass, receipt) or 20px (Next shifts); rows pack at 12px vertical padding with a 12px icon gap; the pass pads 18px. Sheets use 20px between fieldsets and 8px between chips. Touch targets are never under 44px; rows that act are at least 56px, chips 48px, buttons 56 to 58px.

On desktop the same 480px column centres; there is no wider layout yet.

## Elevation & Depth

Mostly flat, white on white, with depth reserved for the two things you "carry".

### Shadow Vocabulary
- **Pass lift** (`box-shadow: 0 8px 24px -12px rgb(0 0 0 / 0.45)`): the black Shift Pass only, so it reads as an object sitting on the page.
- **Card lift** (`box-shadow: 0 2px 6px -2px rgb(0 0 0 / 0.08)`): each upcoming-shift card, so the tucked stack reads as layered passes.

Rows, the dock, banners and chips have no shadow; they separate with hairlines or tint. Sheets use the shadcn drawer's overlay.

### Named Rules
**The Only Objects Cast Rule.** Only pass-like objects (the Shift Pass and upcoming cards) cast shadows. Everything else is flat.

## Shapes

Two corner radii do almost all the work: **pass corners** (18px) for the Shift Pass, the empty "No shift today" card and receipt banners; **control corners** (14px) for buttons, upcoming cards, choice chips, the network alert and empty-state panels. Pills (full) are reserved for the status chip, icon discs, the avatar and the progress track. Status rows are square-edged with only a bottom hairline. Borders are 1px hairlines; the one 2px border is the outlined unrostered clock-in button.

## Components

### Buttons
Big, flat, full-width and calm; one press shrinks them a hair.
- **Shape:** control corners (14px).
- **Primary (docked):** Club Red, White label, 58px tall, full column width, Action type. Pressed: Pressed Red plus `scale(0.99)` over 150ms. Busy: Pressed Red with a spinner and the step in words ("Checking your location…", "Saving…"). Saved: a white tick draws itself and the label reads "Saved" for 1.4s before settling.
- **Primary (sheet footer):** same red, 56px tall. Disabled falls back to Soft Grey with Quiet Grey text, never faded red.
- **Outline:** Paper White with a 1px Hairline border (sheet "Keep working", "Try again"), or a 2px Ink border on the dock when the person is not on the roster today, so an unrostered clock-in is available but not promoted.
- **Focus:** 2px Ink outline, 2px offset, on every interactive element.

### Chips
- **Status chip (on the pass):** white pill with black 13px semibold text. "On shift" leads with the 7px red live dot; "Done" leads with a check; "Starts in 1h 20m" inverts to Pass Rule ground with white text. Crossfades in when the state changes.
- **Choice chip (sheets):** 48px tall, control corners, Hairline border on white. Selected inverts to Ink ground with white text (`aria-pressed`). Never red.

### Cards / Containers
- **Corner Style:** control corners (14px) for upcoming cards; pass corners (18px) for the pass.
- **Background:** Paper White; tucked cards in the stack drop to Soft Grey.
- **Shadow Strategy:** Card lift (see Elevation).
- **Border:** 1px Hairline.
- **Internal Padding:** 14px vertical, 16px horizontal; 18px icon, 12px gap.

### Status Rows
Hairline list rows directly under the pass, not cards. A 36px tinted icon disc (Saved Green, Check Amber or Soft Grey with an 18px stroke icon), a 16px medium title, a 14px Quiet Grey detail, and a chevron only when the row opens something. Tappable rows are at least 56px and flash Soft Grey on press.

### Inputs / Fields
Only the shadcn textarea, used as the "Or write your own reason" fallback under quick-reason chips, at 16px text (no iOS zoom) and 80px minimum height. Quick chips are the expected path; typing is optional.

### Drawers / Sheets
Bottom drawers (shadcn/vaul), max 480px, left-aligned header: 20px semibold title, 15px description that states the consequence in plain words. Footer stacks the red primary over an outline secondary. Used for "Ask for extra time" (amount chips, reason chips, Send · 20 min) and "Clock out now?" (only before the approved finish).

### Receipt Banner
The confirmation after any clock or request, placed under the greeting, announced via a polite live region. Pass corners, 14px by 16px padding, Saved Green or Check Amber tint, a tinted circle with a drawn tick (in both tones, because the time is saved either way), a 16px semibold title that uses the first name ("You're clocked in, Maria."), a 15px detail at 80% ink, and a 40px dismiss target. Auto-dismisses after 12 seconds.

### Upcoming Stack
"Next shifts" shows the first three cards tucked under each other: each later card overlaps by 8px, scales down 3% per step and sits on Soft Grey. "Show all N" fans them into a list with 8px gaps over 300ms; the chevron flips.

### The Shift Pass (signature)
A near-black card with pass corners and Pass lift. Header row: shift-type icon plus "Night shift" in Pass Grey, status chip right. Then the Display time range, the progress line, the legend (In / Finish or Out), a Pass Rule divider and the Worked / Left (or Over) stats at 20px. Before the shift it says "Tap Clock in when you arrive."; with no shift today it becomes an outlined white card ("No shift today", next shift line).

**The progress line** is the system's signature: a 6px Pass Rule track; a white fill for worked time; a 2px by 16px white **finish mark** at the approved length; and a **dotted extra zone** (3px dash, 3px gap, Zone Dash) from the approved length to the maximum shift length, showing time that could still be approved. Approving extra time moves the mark into the zone. Past the mark the fill keeps going and the scale grows with it. Unscheduled sessions show the fill only, with no mark or zone. Fill and mark ease over 700ms on minute ticks.

### Named Rules
**The Never Cut Rule.** The progress line never clips, caps or rounds worked time. Past the mark it keeps filling, the stat reads "Over", and the note says Carly will check it and all time is saved.

**The One Pass Rule.** One black pass per screen. Other information goes in rows or white cards, never a second black card.

### Motion
- Pass state content and the status chip fade in over 500ms (`motion-safe` only).
- Receipt banner fades and slides 8px down over 300ms (`motion-safe` only).
- The confirmation tick draws once: 450ms, `cubic-bezier(0.16, 1, 0.3, 1)`, 120ms delay. Under reduced motion it renders complete.
- Progress fill and mark: 700ms ease-out; stack fan: 300ms ease-out; both disabled under reduced motion.
- Button press: 150ms background and 0.99 scale.

### Voice
Short sentences, common words, no idioms or slang (several readers have English as a second language). Use the first name in confirmations. State what happened, then what happens next: "We couldn't get your location when you clocked in. Carly will check it." Errors say "Not saved yet. Check your internet and try again." Never blame; never say "error", "violation" or "invalid".

## Do's and Don'ts

### Do:
- **Do** keep Club Red to the single primary action of a view and the 7px live dot.
- **Do** use Check Amber with "Carly will check it" for every flag, and always say the time is saved.
- **Do** put today's shift in the Shift Pass with the progress line, finish mark and dotted extra zone.
- **Do** dock the primary button at 58px, full width, at the bottom in thumb reach, with the step written on the button while it works.
- **Do** confirm actions with a receipt banner that uses the first name and a drawn tick.
- **Do** use tabular numerals and the duration format "2h 17m" everywhere.
- **Do** keep touch targets at 44px or more, rows at 56px when tappable, chips at 48px.
- **Do** guard every movement with `motion-safe` or a `motion-reduce` fallback.
- **Do** change brand colour only through the brand-layer tokens.

### Don't:
- **Don't** use red, or the shadcn `destructive` token, for errors, flags, warnings or declined states.
- **Don't** block or disable an action because of location, roster or time problems; flag it instead.
- **Don't** draw the progress line, stats or copy in a way that cuts, caps or rounds worked time.
- **Don't** use a round timer button or a dashboard of many cards.
- **Don't** add a second black pass or put shadows on rows, banners or the dock.
- **Don't** recreate, trace or approximate the World Gym logo; use the text wordmark until the official file arrives.
- **Don't** set labels in uppercase other than the wordmark, and don't add small caps labels above headings.
- **Don't** use idioms, slang or blame words in any copy.
