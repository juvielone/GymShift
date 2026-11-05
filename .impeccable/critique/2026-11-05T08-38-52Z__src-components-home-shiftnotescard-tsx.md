---
target: Notes for the shift (ShiftNotesCard + ShiftNotesSection)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\juvie\\Downloads\\000N\\src\\components\\home\\ShiftNotesCard.tsx"
target_fingerprint: "sha256:090234017bfa3bedac0c732be73eb56411c4874750a6c82fa90a3389c613e05a"
target_path: "C:\\Users\\juvie\\Downloads\\000N\\src\\components\\home\\ShiftNotesCard.tsx"
timestamp: 2026-11-05T08-38-52Z
slug: src-components-home-shiftnotescard-tsx
---
DEGRADED: single-context (no sub-agents spawned: session policy; A before B).
Target: Notes for the shift (ShiftNotesCard.tsx, ShiftNotesSection.tsx in ShiftSheet.tsx). Mode: Operate.

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Seen/Not seen clear, but only inside each shift sheet |
| 2 | Match System / Real World | 3 | Plain words; megaphone reads as broadcast |
| 3 | User Control and Freedom | 3 | Take back exists; sending closes the sheet |
| 4 | Consistency and Standards | 2 | Amber disc + invented hard offset shadow on unseen card |
| 5 | Error Prevention | 2 | One-tap Take back, no confirm/undo |
| 6 | Recognition Rather Than Recall | 3 | Notes name their shift; seen future notes not on their shift card |
| 7 | Flexibility and Efficiency | 2 | One shift at a time; box below staff list |
| 8 | Aesthetic and Minimalist Design | 2 | Seen future notes stack under the pass |
| 9 | Error Recovery | 3 | Plain errors, text preserved |
| 10 | Help and Documentation | 3 | Help entry + hint line |
| Total | | 26/40 | Acceptable |

Specificity: roster section on-system; cleaner card is a generic alert callout (amber + hard shadow) outside the Shift Pass world.
Detector: CLI 0 findings. Overlay: Josh home 2 (straggler "am" in note meta — real; repeating stripes — pass extra zone, false positive). Carly sheet 4 (straggler "fortnight" in roster header — pre-existing; 3x low-contrast #999 — not from these components, unattributed).

Priority issues:
1. [P1] Unseen note card reads as a warning (amber disc, hard shadow, heavy outline). Fix: neutral disc, hairline card + card lift, ink "New" pill, Got it stays ink; seen = flat row. /impeccable polish
2. [P1] Note box buried below staff list in roster ShiftSheet. Fix: "Note for Josh" row under the sheet header with status; expands to textarea. /impeccable layout
3. [P2] Seen future-shift notes pile up under the pass. Fix: top shows unseen + today's only; seen future notes move into that Next shifts card foot. /impeccable distill
4. [P2] No seen/unseen indicator on roster rows or Today pass. Fix: small note glyph + "Note · not seen yet". /impeccable shape
5. [P2] Take back is one amber tap, no confirm/undo. Fix: inline confirm or Undo Row. /impeccable harden

Personas: Maria (ESL cleaner) reads amber as trouble; meta line dense, "am" orphan. Casey: stacked notes push rows behind the dock. Alex/Carly: repeat note per shift, scroll past staff each time, sheet closes on send. Sam: new note not announced (no live region).

Minor: "7:00 am" wrap; megaphone icon; double space before "· Not seen yet"; placeholder wrap; raw textarea vs shadcn textarea; send closes sheet (offer View).

Questions: new note as a line inside the pass? Note chip on roster rows instead of sheet section? Unseen 30 min before shift -> Carly's list?
