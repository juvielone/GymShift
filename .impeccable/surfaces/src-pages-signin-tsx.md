---
version: 1
slug: "src-pages-signin-tsx"
primary_target: "src/pages/SignIn.tsx"
related_targets: ["src/components/manager/StaffSheet.tsx"]
---

# Sign in (src/pages/SignIn.tsx)

Scope: the sign-in screen that replaces the demo login, plus Carly's PIN reveal on Add person / Reset PIN (src/components/manager/StaffSheet.tsx). Mode: Operate. Seen about once per phone; staff stay signed in.

Audience and job: a cleaner (some read English as a second language) types their username and the 6-digit PIN Carly gave them. Carly types her username and a password. Constraints: PRD F1 (1 Nov 2026): typed username, never list staff names; PIN auto-submits on the 6th digit; PIN shown once to Carly, app-generated; demo mode adds a quiet demo-accounts helper on the same screen.

## Direction contract

THESIS: Signing in is punching the gym's time clock: the number pad owns the lower half and the sixth digit is the action. Refuses the category default of two stacked text fields and a big Sign in button.

OWN-WORLD: GymShift's light world unchanged: white ground, ink text, hairline 1px dividers, control corners 14px, Geist with tabular numerals. Six 52px boxed PIN cells (hairline, filled ink dot, 2px ink border on the next cell). Keypad is a hairline grid, not floating buttons. Red only as the text caret and the password mode's single Sign in button.

STORY: The person sees where they are (wordmark), types their name, and the pad is ready; they enter six digits and land on their home. A wrong PIN clears the cells with an amber line and a short shake; nothing blames them.

FIRST VIEWPORT: 48px wordmark bar; 28px "Sign in" headline with one 15px Quiet Grey line; 48px name field; six PIN cells; a full-width 3×4 hairline keypad with 72px keys docked at the bottom; under it "Use a password instead" text button and "Forgot it? Ask Carly." In password mode the PIN cells and keypad give way to a password field and the red Sign in button.

FORM: keypad-first, position 3 on the ordered list (dealt lead). seed:2d65116a322cd90b

Signature interaction: the next-cell 2px ink border walks along the cells as digits go in; on the sixth the cells hold while "Signing in…" replaces the subline; a wrong PIN shakes the row 6px (motion-safe) and clears.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
